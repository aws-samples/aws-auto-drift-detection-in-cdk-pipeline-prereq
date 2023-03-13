/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

'use strict';
import { Construct } from 'constructs';
import { RemovalPolicy, Stack, StackProps, Duration } from 'aws-cdk-lib';
import { aws_lambda as lambda } from 'aws-cdk-lib';
import { aws_iam as iam } from 'aws-cdk-lib';
import { aws_ssm as ssm } from 'aws-cdk-lib';
import { aws_dynamodb as dynamodb } from 'aws-cdk-lib';
import { aws_events as events } from 'aws-cdk-lib';
import { aws_events_targets as targets } from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import {
	SSM_PARAM_DRIFT_DETECT_DB_ARN,
	SSM_PARAM_EXT_LIB_LAYER,
	SSM_PARAM_DRIFT_DETECT_LAMBDA_ARN,
	SSM_PARAM_CALLBACK_LAMBDA_ARN,
} from '../utils/cdk-utils';

/**
 * Stack to deploy common components and lambda layers required for the project
 */
export class DriftDetectionPrereqStack extends Stack {
	// Base path layers
	private basePathLayers = 'dist/layer';
	private basePath = 'dist/prereq-stack';
	private logLevel = 'INFO';

	constructor(scope: Construct, id: string, props?: StackProps) {
		super(scope, id, props);

		/********************************* DynamoDB Table ***********************************/
		// DynamoDB table to load data in via custom resource
		const driftDetectDb = new dynamodb.Table(this, 'DriftDetectDb', {
			partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
			sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
			billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
			pointInTimeRecovery: true,
			removalPolicy: RemovalPolicy.DESTROY,
		});
		/**************************************************************************************/

		/******************** Create Lambda Layer with external libraries **********************/
		// Layer with third party libs
		const externalLibLayer: lambda.ILayerVersion = new lambda.LayerVersion(
			this,
			'ExternalLibLayer',
			{
				code: lambda.Code.fromAsset(
					this.basePathLayers.concat('/external-lib')
				),
				compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
			}
		);
		/****************************************************************************************/

		/**************************** Create Drift Detection Lambda ***************************/
		// Lambda to initiate drift detection step
		const driftDetectLambda = new lambda.Function(
			this,
			'InitiateDriftDetectLambda',
			{
				runtime: lambda.Runtime.NODEJS_18_X,
				code: lambda.Code.fromAsset(
					this.basePath.concat('/lambda/drift-detect-lambda')
				),
				handler: 'index.handler',
				timeout: Duration.seconds(600),
				environment: {
					DDB_TABLE: driftDetectDb.tableName,
					ACCOUNT_ID: this.account,
					REGION: this.region,
					LOG_LEVEL: this.logLevel,
				},
				layers: [externalLibLayer],
			}
		);
		driftDetectLambda.addToRolePolicy(
			new iam.PolicyStatement({
				actions: ['dynamodb:PutItem', 'dynamodb:GetItem'],
				effect: iam.Effect.ALLOW,
				resources: [driftDetectDb.tableArn],
			})
		);
		driftDetectLambda.addToRolePolicy(
			new iam.PolicyStatement({
				actions: [
					'cloudformation:DescribeStacks',
					'cloudformation:DetectStackDrift',
					'cloudformation:DetectStackResourceDrift',
					'cloudformation:BatchDescribeTypeConfigurations',
				],
				effect: iam.Effect.ALLOW,
				resources: ['*'],
			})
		);
		driftDetectLambda.role?.addManagedPolicy(
			iam.ManagedPolicy.fromAwsManagedPolicyName('ReadOnlyAccess')
		);
		driftDetectLambda.addToRolePolicy(
			new iam.PolicyStatement({
				actions: [
					'codepipeline:PutJobSuccessResult',
					'codepipeline:PutJobFailureResult',
				],
				effect: iam.Effect.ALLOW,
				resources: ['*'],
			})
		);
		// Suppress findings for things automatically added by cdk or that are needed for the workshop
		NagSuppressions.addResourceSuppressions(
			driftDetectLambda,
			[
				{
					id: 'AwsSolutions-IAM4',
					reason: 'AWSLambdaBasicExecutionRole is automatically added by cdk',
					appliesTo: [
						'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
					],
				},
				{
					id: 'AwsSolutions-IAM4',
					reason: 'ReadOnlyAccess is needed for drift detection',
					appliesTo: [
						'Policy::arn:<AWS::Partition>:iam::aws:policy/ReadOnlyAccess',
					],
				},
				{
					id: 'AwsSolutions-IAM5',
					reason:
						'Generic lambda that is supposed to work for all stacks and code pipelines.',
					appliesTo: ['Resource::*'],
				},
			],
			true
		);
		/****************************************************************************************/

		/********************************* Create Callback Lambda *******************************/
		// Lambda to callback CDK pipeline to finish drift detection step
		const callbackLambda = new lambda.Function(this, 'CallbackLambda', {
			runtime: lambda.Runtime.NODEJS_18_X,
			code: lambda.Code.fromAsset(
				this.basePath.concat('/lambda/callback-lambda')
			),
			handler: 'index.handler',
			timeout: Duration.seconds(600),
			environment: {
				DDB_TABLE: driftDetectDb.tableName,
				ACCOUNT_ID: this.account,
				REGION: this.region,
				LOG_LEVEL: this.logLevel,
			},
			layers: [externalLibLayer],
		});
		callbackLambda.addToRolePolicy(
			new iam.PolicyStatement({
				actions: ['dynamodb:PutItem', 'dynamodb:GetItem'],
				effect: iam.Effect.ALLOW,
				resources: [driftDetectDb.tableArn],
			})
		);
		callbackLambda.addToRolePolicy(
			new iam.PolicyStatement({
				actions: [
					'codepipeline:PutJobSuccessResult',
					'codepipeline:PutJobFailureResult',
				],
				effect: iam.Effect.ALLOW,
				resources: ['*'],
			})
		);
		// Suppress findings for things automatically added by cdk or that are needed for the workshop
		NagSuppressions.addResourceSuppressions(
			callbackLambda,
			[
				{
					id: 'AwsSolutions-IAM4',
					reason: 'AWSLambdaBasicExecutionRole is automatically added by cdk',
					appliesTo: [
						'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
					],
				},
				{
					id: 'AwsSolutions-IAM5',
					reason:
						'Generic lambda that is supposed to work for all code pipelines.',
					appliesTo: ['Resource::*'],
				},
			],
			true
		);
		/****************************************************************************************/

		/********************************* Drift detection event *******************************/
		new events.Rule(this, 'DriftDetectionRule', {
			ruleName: 'DetectStackDrift',
			targets: [new targets.LambdaFunction(callbackLambda)],
			description:
				'Intercept drift detection event and initiate callback lambda',
			enabled: true,
			eventPattern: {
				source: ['aws.cloudformation'],
				detailType: ['CloudFormation Drift Detection Status Change'],
			},
		});
		/****************************************************************************************/

		/************************** List of outputs to parameter store **************************/
		new ssm.StringParameter(this, 'ParamDriftDetectDBArn', {
			stringValue: driftDetectDb.tableArn,
			description: 'DynamoDB table arn',
			dataType: ssm.ParameterDataType.TEXT,
			parameterName: SSM_PARAM_DRIFT_DETECT_DB_ARN,
			simpleName: false,
		});

		new ssm.StringParameter(this, 'ParamExtLibLayer', {
			stringValue: externalLibLayer.layerVersionArn,
			description: 'Layer version arn for exteral lib layer',
			dataType: ssm.ParameterDataType.TEXT,
			parameterName: SSM_PARAM_EXT_LIB_LAYER,
			simpleName: false,
		});

		new ssm.StringParameter(this, 'ParamDriftDetectLambdaArn', {
			stringValue: driftDetectLambda.functionArn,
			description: 'Drift detection lambda arn',
			dataType: ssm.ParameterDataType.TEXT,
			parameterName: SSM_PARAM_DRIFT_DETECT_LAMBDA_ARN,
			simpleName: false,
		});

		new ssm.StringParameter(this, 'ParamCallbackLambdaArn', {
			stringValue: callbackLambda.functionArn,
			description: 'Callback lambda arn',
			dataType: ssm.ParameterDataType.TEXT,
			parameterName: SSM_PARAM_CALLBACK_LAMBDA_ARN,
			simpleName: false,
		});
		/************************************* End Outputs ************************************/
	}
}
