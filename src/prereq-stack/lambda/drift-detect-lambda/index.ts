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
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import {
	CloudFormation,
	DetectStackDriftCommandOutput,
	DescribeStacksCommandOutput,
} from '@aws-sdk/client-cloudformation';
import {
	CodePipeline,
	FailureDetails,
	PutJobSuccessResultCommandOutput,
	PutJobFailureResultCommandOutput,
} from '@aws-sdk/client-codepipeline';

console.info('Loading initiate drift detection lambda');

/**
 * Lambda handler
 */
exports.handler = async (event: any, context: any) => {
	console.info(JSON.stringify(event));

	const jobId: string = event['CodePipeline.job']['id'];
	const params = JSON.parse(
		event['CodePipeline.job']['data']['actionConfiguration']['configuration'][
			'UserParameters'
		]
	);
	const cfnClient = new CloudFormation({ region: params.region });
	// Check if stack exists
	console.info('Check if the stack exists');
	let stacksOutput: DescribeStacksCommandOutput = {
		$metadata: {},
	};
	try {
		stacksOutput = await cfnClient.describeStacks({
			StackName: params.stackName,
		});
		console.debug(JSON.stringify(stacksOutput));
	} catch (err: any) {
		console.error(JSON.stringify(err));
		if (err.name == 'ValidationError' || err.Code == 'ValidationError') {
			console.info('Stack does not exist. Send success');
			await sendSuccess(jobId);
		} else {
			console.info('Send failure');
			const details: FailureDetails = {
				message: JSON.stringify(err),
				type: 'JobFailed',
			};
			await sendFailure(jobId, details);
		}
		return;
	}
	// Prepare for drift detection
	const allowed_dd_status_list: string[] = [
		'CREATE_COMPLETE',
		'UPDATE_COMPLETE',
		'UPDATE_ROLLBACK_COMPLETE',
		'UPDATE_ROLLBACK_FAILED',
	];
	let driftResp: DetectStackDriftCommandOutput = {
		$metadata: {},
		StackDriftDetectionId: '',
	};
	try {
		if (
			stacksOutput.Stacks &&
			stacksOutput.Stacks.length > 0 &&
			stacksOutput.Stacks[0].StackName == params.stackName
		) {
			console.info('Stack exists, now check for the stack status');
			if (
				stacksOutput.Stacks[0].StackStatus &&
				allowed_dd_status_list.includes(stacksOutput.Stacks[0].StackStatus)
			) {
				console.info('Stack Status allows for drift detection');
				driftResp = await cfnClient.detectStackDrift({
					StackName: params.stackName,
				});
				console.debug(JSON.stringify(driftResp));
			} else {
				console.info('Stack status does not allow for drift detection');
				await sendSuccess(jobId);
				return;
			}
		} else {
			const message = 'Unknown error: Check DescribeStacks output';
			console.error(message);
			throw new Error(message);
		}
	} catch (err: any) {
		console.error(JSON.stringify(err));
		if (err.name == 'ValidationError' || err.Code == 'ValidationError') {
			console.info('Cannot start drift detection. Send success');
			await sendSuccess(jobId);
		} else {
			console.info('Send failure');
			const details: FailureDetails = {
				message: JSON.stringify(err),
				type: 'JobFailed',
			};
			await sendFailure(jobId, details);
		}
		return;
	}
	// Log data into dynamodb
	try {
		if (driftResp.StackDriftDetectionId) {
			console.debug(
				`Drift detection started. DriftDetectionId: ${driftResp.StackDriftDetectionId}`
			);
			const ddbClient = new DynamoDB({ region: process.env.AWS_REGION });
			await ddbClient.putItem({
				TableName: process.env.DDB_TABLE,
				Item: {
					pk: {
						S: `${params.account}#${params.region}#${params.stackName}`,
					},
					sk: {
						S: driftResp.StackDriftDetectionId,
					},
					pipeline_job_id: {
						S: jobId,
					},
				},
			});
		} else {
			const message = 'Unknown error: Drift detection id missing';
			console.error(message);
			throw new Error(message);
		}
	} catch (err: any) {
		console.error(JSON.stringify(err));
		console.info('Send failure');
		const details: FailureDetails = {
			message: JSON.stringify(err),
			type: 'JobFailed',
		};
		await sendFailure(jobId, details);
		return;
	}
	return;
};

/**
 * Function to send success back to the code pipeline
 * @param jobId
 */
async function sendSuccess(jobId: string) {
	const pipelineClient = new CodePipeline({ region: process.env.AWS_REGION });
	const response: PutJobSuccessResultCommandOutput =
		await pipelineClient.putJobSuccessResult({
			jobId: jobId,
		});
	console.debug(JSON.stringify(response));
}

/**
 * Function to send failure back to the code pipeline
 * @param jobId
 * @param details
 */
async function sendFailure(jobId: string, details: FailureDetails) {
	const pipelineClient = new CodePipeline({ region: process.env.AWS_REGION });
	const response: PutJobFailureResultCommandOutput =
		await pipelineClient.putJobFailureResult({
			jobId: jobId,
			failureDetails: details,
		});
	console.debug(JSON.stringify(response));
}
