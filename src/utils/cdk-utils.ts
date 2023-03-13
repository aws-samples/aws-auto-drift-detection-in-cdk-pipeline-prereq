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
export function getNormalizedResourceName(...names: string[]) {
	return names
		.join('')
		.trim()
		.replace(/ /g, '')
		.replace(/\./g, '')
		.replace(/-/g, '');
}

export function getNormalizedCfnExportedName(...names: string[]) {
	return names
		.join('-')
		.trim()
		.toUpperCase()
		.replace(/ /g, '-')
		.replace(/\./g, '-')
		.replace(/_/g, '-');
}

export const SSM_PARAM_PREFIX = '/DEMO/DRIFT_DETECTION';
export const SSM_PARAM_DRIFT_DETECT_DB_ARN =
	SSM_PARAM_PREFIX.concat('/DYNAMODB/ARN');
export const SSM_PARAM_EXT_LIB_LAYER = SSM_PARAM_PREFIX.concat(
	'/LAYER/EXT_LIB_LAYER_ARN'
);
export const SSM_PARAM_DRIFT_DETECT_LAMBDA_ARN = SSM_PARAM_PREFIX.concat(
	'/LAMBDA/INITIATE_DRIFT_DETECT/ARN'
);
export const SSM_PARAM_CALLBACK_LAMBDA_ARN = SSM_PARAM_PREFIX.concat(
	'/LAMBDA/CALLBACK/ARN'
);
