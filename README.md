# Auto Drift Detection CDK Pipelines Prereq

## Project is a pre-requiste stack to be deployed as part of the solution depicted in the blog [here](placeholder link).

## License

This library is licensed under the MIT-0 License. See the LICENSE file.

### System requirements

- [node (version >= 18x)](https://nodejs.org/en/download/)
- [awscli (v2)](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html)
- [cdk (v2)](https://docs.aws.amazon.com/cdk/v2/guide/cli.html)
- [jq (v1.6)](https://github.com/stedolan/jq/wiki/Installation)

## Prerequisites

Before proceeding any further, you need to identify and designate an AWS account to deploy the solution. You also need to create an AWS account profile in `~/.aws/credentials` for the designated AWS account, if you don’t already have one. The profile needs to have sufficient permissions to run an [AWS Cloud Development Kit](https://aws.amazon.com/cdk/) (AWS CDK) stack. It should be your private profile and only be used during the course of this blog. So, it should be fine if you want to use admin privileges. Don’t share the profile details, especially if it has admin privileges. I recommend removing the profile when you’re finished with the testing. For more information about creating an AWS account profile, see [Configuring the AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html).

## Project Structure

Project is a part of the solution to integrate automated drift detection in CDK pipelines. It deploys a stack under `src/` folder which is a pre-requsite to the forementioned solution. `src/prereq-stack/stack.ts` deploys following resources

> drift-detect-lambda
> callback-lambda
> DynamoDB table to hold necessary drift detection details
> Event rule to listen to drift detection events.
>
> `drift-detect-lambda` implements a custom step in the CDK pipeline. The step is a pre-cursor check to determine whether the stack being deployed has drifted from its configuration defined by CloudFormation template. CDK pipeline invokes the lambda and awaits response. Lambda initiates the drift detection check and receives a `drift detection id` as the response from CloudFormation service. `drift detection id` is then persisted in a DynamoDB table.
> Event bridge is configured to listen to drit detection events and trigger `callback-lambda`.
> `callback-lambda` upon receiving the drift detection event, queries DynamoDB table to retrieve the necessary info required to initiate a callback to the CDK pipeline. If stack is in the drifted status, then a failure is sent back to the pipeline; else a success is sent so that the pipeline can continue.

## Deployment using CDK

> 1. Clone the repo
> 2. Navigate to the cloned folder
> 3. run `script-deploy.sh` as shown below by passing the name of the AWS profile you created in the prerequisites section above. If no profile name is passed then **default** profile will be used.
>    `./script-deploy.sh <AWS-ACCOUNT-PROFILE-NAME>`
>    All the stacks should now be deployed.
