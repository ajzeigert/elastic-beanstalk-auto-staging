import {
	// CreateApplicationCommand,
	CreateEnvironmentCommand,
	ElasticBeanstalkClient,
	// ListPlatformBranchesCommand,
	// DescribeApplicationsCommand,
	DescribeEnvironmentsCommand,
	ListAvailableSolutionStacksCommand,
} from "@aws-sdk/client-elastic-beanstalk";
import core from "@actions/core";
// import github from "@actions/github";

try {
	const client = new ElasticBeanstalkClient({ region: "us-west-2" });
	const eb_application_name = core.getInput("eb_application_name");
	const existingEnvironment = await client.send(
		new DescribeEnvironmentsCommand({
			ApplicationNames: [eb_application_name],
		})
	);
	if (existingEnvironment.Environments.length < 1) {
		throw new Error("No existing environment found");
	}
	let EnvironmentName = existingEnvironment.Environments[0].EnvironmentName;
	let envSettings = await client.send(
		new DescribeConfigurationSettingsCommand({
			EnvironmentName,
		})
	);
	const ConfigurationSettings = envSettings.ConfigurationSettings;
	const OptionSettings = ConfigurationSettings[0].OptionSettings;
	const namespacesToCopy = [
		"aws:autoscaling:launchconfiguration",
		"aws:ec2:vpc",
		"aws:elasticbeanstalk:application:environment",
	];
	const optionsToCopy = OptionSettings.filter((option) =>
		namespacesToCopy.includes(option.Namespace)
	).map((setting) => {
		if (
			setting.Namespace === "aws:elasticbeanstalk:application:environment" &&
			setting.OptionName === "NODE_ENV"
		) {
			setting.Value = "staging";
		}
		return setting;
	});

	const input = {
		ApplicationName: eb_application_name,
		EnvironmentName: `${eb_application_name}-staging`,
		SolutionStackName: existingEnvironment.Environments[0].SolutionStackName,
		Tier: {
			// EnvironmentTier
			Name: "WebServer",
			Type: "Standard",
		},
		OptionSettings: [
			...optionsToCopy,
			{
				// ConfigurationOptionSetting
				Namespace: "aws:elasticbeanstalk:cloudwatch:logs",
				OptionName: "StreamLogs",
				Value: true,
			},
			{
				// ConfigurationOptionSetting
				Namespace: "aws:elasticbeanstalk:cloudwatch:logs",
				OptionName: "DeleteOnTerminate",
				Value: true,
			},
			{
				Namespace: "aws:elasticbeanstalk:environment",
				OptionName: "EnvironmentType",
				Value: "LoadBalanced",
			},
			{
				Namespace: "aws:autoscaling:asg",
				OptionName: "MinSize",
				Value: 1,
			},
			{
				Namespace: "aws:autoscaling:asg",
				OptionName: "MaxSize",
				Value: 1,
			},
			{
				Namespace: "aws:elasticbeanstalk:environment",
				OptionName: "ServiceRole",
				Value: "aws-elasticbeanstalk-service-role",
			},
			{
				Namespace: "aws:autoscaling:launchconfiguration",
				OptionName: "InstanceType",
				Value: "t3-micro",
			},
			{
				Namespace: "aws:autoscaling:launchconfiguration",
				OptionName: "IamInstanceProfile",
				Value: "aws-elasticbeanstalk-ec2-role",
			},
		],
	};
	const createCommand = new CreateEnvironmentCommand(input);
	const createResponse = await client.send(createCommand);

	core.setOutput(createResponse);
} catch (error) {
	core.setFailed(error.message);
}
