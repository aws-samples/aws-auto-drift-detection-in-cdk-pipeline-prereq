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
import {
	CodePipeline,
	FailureDetails,
	PutJobFailureResultCommandOutput,
	PutJobSuccessResultCommandOutput,
} from '@aws-sdk/client-codepipeline';
import { DynamoDB, GetItemCommandOutput } from '@aws-sdk/client-dynamodb';

console.info('Loading callback lambda');

/**
 * Lambda handler
 */
exports.handler = async (event: any, context: any) => {
	console.info(JSON.stringify(event));
	if (event['detail-type'] == 'CloudFormation Drift Detection Status Change') {
		const jobId = await fetchCallbackDetails(event);
		if (jobId) {
			if (
				event['detail']['status-details']['stack-drift-status'] == 'DRIFTED'
			) {
				const message = `Stack ${event['detail']['stack-id']} has DRIFTED from its template configuration`;
				console.info(message);
				console.info('Send failure');
				const details: FailureDetails = {
					message: message,
					type: 'JobFailed',
				};
				await sendFailure(jobId, details);
			} else if (
				event['detail']['status-details']['stack-drift-status'] == 'IN_SYNC'
			) {
				console.info('Send success');
				await sendSuccess(jobId);
			}
		} else {
			console.error(
				'Drift detection event details does not match with db record'
			);
		}
	} else {
		console.error('Event detail type not supported.');
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

/**
 * Fuction to retrieve CodePipeline JobId from dynamodb that is associated with the drift detection id.
 * The JobId is then used to send a success/failure callback to CodePipeline
 * @param event
 * @returns
 */
async function fetchCallbackDetails(event: any) {
	console.info('Fetch callback details');
	const stackName = await extractStackNameFromArn(event['detail']['stack-id']);
	const stackAccount = event['account'];
	const stackRegion = event['region'];
	const driftDetectId = event['detail']['stack-drift-detection-id'];
	const ddbClient = new DynamoDB({ region: process.env.AWS_REGION });
	let jobId;
	try {
		const resp: GetItemCommandOutput = await ddbClient.getItem({
			TableName: process.env.DDB_TABLE,
			Key: {
				pk: {
					S: `${stackAccount}#${stackRegion}#${stackName}`,
				},
				sk: {
					S: driftDetectId,
				},
			},
		});
		console.debug(JSON.stringify(resp));
		if (resp.Item) {
			jobId = resp.Item['pipeline_job_id']['S'];
		}
	} catch (err: any) {
		console.error(JSON.stringify(err));
	}
	return jobId;
}

async function extractStackNameFromArn(stackArn: string) {
	// Sample Input: "arn:aws:cloudformation:ap-northeast-2:123456789012:stack/example-stack/11111111"
	// Sample Output: example-stack"
	const stackItems = stackArn.split(':');
	const stackId = stackItems.pop();
	const stackIdItems = stackId?.split('/');
	const stackName = stackIdItems ? stackIdItems[1] : '';
	return stackName;
}
