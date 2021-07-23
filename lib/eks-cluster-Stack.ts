import iam = require('@aws-cdk/aws-iam');
import ec2 = require('@aws-cdk/aws-ec2');
import eks = require('@aws-cdk/aws-eks');
import cdk = require('@aws-cdk/core');
import route53 = require('@aws-cdk/aws-route53');

import { InstanceType } from '@aws-cdk/aws-ec2';
import { ClusterAutoScaler } from './cluster-autoscaler';
import { IngressNginxController } from './nginx-ingress';
import { CertManager } from './cert-manager';
import { PrimeHub } from './primehub';
import { NvidiaDevicePlugin } from './nvidia-device-plugin';

export interface EksStackProps extends cdk.StackProps {
  name:  string;
  username: string;
  basedDomain:  string;
  primehubPassword: string;
  keycloakPassword: string;
  masterRole?:  string;
}

export class EKSCluster extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props: EksStackProps) {
    super(scope, id, props);
    let masterRole;
    let primehubDomain;
    const env: cdk.Environment = props.env || {};
    const account: string  = env.account || '';
    const region: string = env.region || 'ap-northeast-1';
    const clusterName = `eks-${props.name}`;

    const vpc = new ec2.Vpc(this, 'vpc', {
      enableDnsHostnames: true,
      enableDnsSupport: true,
      natGateways: 0,
    });  // Create a new VPC for our cluster

    // cluster master role
    if (props.masterRole) {
      masterRole = iam.Role.fromRoleArn(this, 'imported-master-rold', props.masterRole);
    } else {
      masterRole = new iam.Role(this, 'eks-master-role', {
        roleName: `${clusterName}-master-role`,
        assumedBy: new iam.AnyPrincipal(),
      });
    }

    const eksCluster = new eks.Cluster(this, 'Cluster', {
      version: eks.KubernetesVersion.V1_20,
      mastersRole: masterRole,
      clusterName: clusterName,
      outputClusterName: true,

      // Networking related settings listed below - important in enterprise context.
      endpointAccess: eks.EndpointAccess.PUBLIC, // In Enterprise context, you may want to set it to PRIVATE.
      vpc: vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PUBLIC}], // you can also specify the subnets by other attributes
      defaultCapacity: 0,
    });

    const defaultNodeGroup = eksCluster.addNodegroupCapacity('Default-Node-Group',{
      nodegroupName: "default-node-group",
      desiredSize: 1,
      minSize: 1,
      maxSize: 3,
      instanceTypes: [new InstanceType('t3a.xlarge')],
      subnets: {subnetType: ec2.SubnetType.PUBLIC, availabilityZones: ['ap-northeast-1a']},
      tags: {
        Name: `${clusterName}-default-node-group`,
        cluster: clusterName,
        owner: props.username,
        clusterType: "dev-eks"
      },
    });

    const cpuASG = eksCluster.addAutoScalingGroupCapacity('OnDemandCpuASG', {
      autoScalingGroupName: `${clusterName}-scaled-cpu-pool`,
      desiredCapacity: 0,
      minCapacity: 0,
      maxCapacity: 2,
      instanceType: new InstanceType('t3a.xlarge'),
      vpcSubnets: {subnetType: ec2.SubnetType.PUBLIC, availabilityZones: ['ap-northeast-1a']},
      bootstrapOptions: {
        kubeletExtraArgs: "--node-labels=component=singleuser-server,hub.jupyter.org/node-purpose=user --register-with-taints=hub.jupyter.org/dedicated=user:NoSchedule",
      },
    });
    cdk.Tags.of(cpuASG).add('Name', `${clusterName}-scaled-cpu-pool`);
    cdk.Tags.of(cpuASG).add('cluster', clusterName);
    cdk.Tags.of(cpuASG).add('owner', props.username);
    cdk.Tags.of(cpuASG).add('clusterType', 'dev-eks');
    cdk.Tags.of(cpuASG).add(`k8s.io/cluster-autoscaler/${clusterName}`, 'owned');
    cdk.Tags.of(cpuASG).add('k8s.io/cluster-autoscaler/enabled', 'TRUE');
    cdk.Tags.of(cpuASG).add('k8s.io/cluster-autoscaler/node-template/label/auto-scaler', 'enabled');
    cdk.Tags.of(cpuASG).add('k8s.io/cluster-autoscaler/node-template/label/component', 'singleuser-server');
    cdk.Tags.of(cpuASG).add('k8s.io/cluster-autoscaler/node-template/label/hub.jupyter.org/node-purpose', 'user');
    cdk.Tags.of(cpuASG).add('k8s.io/cluster-autoscaler/node-template/taint/hub.jupyter.org/dedicated', 'user:NoSchedule');

    const gpuASG = eksCluster.addAutoScalingGroupCapacity('OnDemandGpuASG', {
      autoScalingGroupName: `${clusterName}-scaled-gpu-pool`,
      desiredCapacity: 0,
      minCapacity: 0,
      maxCapacity: 2,
      instanceType: new InstanceType('g4dn.xlarge'),
      vpcSubnets: {subnetType: ec2.SubnetType.PUBLIC, availabilityZones: ['ap-northeast-1a']},
      bootstrapOptions: {
        kubeletExtraArgs: "--node-labels=component=singleuser-server,hub.jupyter.org/node-purpose=user,nvidia.com/gpu=true --register-with-taints=nvidia.com/gpu=true:NoSchedule",
        dockerConfigJson: '{ "exec-opts": ["native.cgroupdriver=systemd"] }',
      },
    });
    cdk.Tags.of(gpuASG).add('Name', `${clusterName}-scaled-gpu-pool`);
    cdk.Tags.of(gpuASG).add('cluster', clusterName);
    cdk.Tags.of(gpuASG).add('owner', props.username);
    cdk.Tags.of(gpuASG).add('clusterType', 'dev-eks');
    cdk.Tags.of(gpuASG).add(`k8s.io/cluster-autoscaler/${clusterName}`, 'owned');
    cdk.Tags.of(gpuASG).add('k8s.io/cluster-autoscaler/enabled', 'TRUE');
    cdk.Tags.of(gpuASG).add('k8s.io/cluster-autoscaler/node-template/label/auto-scaler', 'enabled');
    cdk.Tags.of(gpuASG).add('k8s.io/cluster-autoscaler/node-template/label/component', 'singleuser-server');
    cdk.Tags.of(gpuASG).add('k8s.io/cluster-autoscaler/node-template/label/hub.jupyter.org/node-purpose', 'user');
    cdk.Tags.of(gpuASG).add('k8s.io/cluster-autoscaler/node-template/taint/nvidia.com/gpu', 'true:NoSchedule');

    // Nvidia device Plugin
    new NvidiaDevicePlugin(this, 'NvidiaDevicePlugin', {
      eksCluster: eksCluster,
      nodeSelector: { 'nvidia.com/gpu': 'true' },
      tolerations: [{ operator: 'Exists', effect: 'NoSchedule' }],
    });

    // Auto Scale
    const autoscalerStmt = new iam.PolicyStatement();
    autoscalerStmt.addResources("*");
    autoscalerStmt.addActions(
      "autoscaling:DescribeAutoScalingGroups",
      "autoscaling:DescribeAutoScalingInstances",
      "autoscaling:DescribeLaunchConfigurations",
      "autoscaling:DescribeTags",
      "autoscaling:SetDesiredCapacity",
      "autoscaling:TerminateInstanceInAutoScalingGroup",
      "ec2:DescribeLaunchTemplateVersions"
    );
    const autoscalerPolicy = new iam.Policy(this, "cluster-autoscaler-policy", {
      policyName: "ClusterAutoscalerPolicy",
      statements: [autoscalerStmt],
    });
    autoscalerPolicy.attachToRole(defaultNodeGroup.role);
    autoscalerPolicy.attachToRole(cpuASG.role);
    autoscalerPolicy.attachToRole(gpuASG.role);

    new ClusterAutoScaler(this, 'cluster-autoscaler', {
      eksCluster: eksCluster,
      version: 'v1.21.0'
    });

    // AWS ECR
    const ecrStamt = new iam.PolicyStatement();
    ecrStamt.addResources("*");
    ecrStamt.addActions(
      "ecr:*",
      "sts:GetServiceBearerToken"
    );
    const ecrPolicy = new iam.Policy(this, "ecr-full-access-policy", {
      policyName: "ECRFullAccessPolicy",
      statements: [ecrStamt],
    });
    ecrPolicy.attachToRole(defaultNodeGroup.role);
    ecrPolicy.attachToRole(cpuASG.role);
    ecrPolicy.attachToRole(gpuASG.role);
    eksCluster.addHelmChart('aws-ecr-credential', {
      chart: "aws-ecr-credential",
      release: "aws-ecr-credential",
      repository: 'https://charts.infuseai.io',
      createNamespace: true,
      namespace: 'hub',
      values: {
        aws: {
          account: account,
          region: region,
        },
        targetNamespace: 'hub'
      },
      wait: false,
    });

    const ingressNginx = new IngressNginxController(this, 'ingress-nginx-controller', {
      eksCluster: eksCluster,
    });

    const certManager = new CertManager(this, 'cert-manager', {
      eksCluster: eksCluster
    });

    const awsElbAddress = new eks.KubernetesObjectValue(this, 'AWS-ELB', {
      cluster: eksCluster,
      objectType: 'service',
      objectName: 'nginx-ingress-ingress-nginx-controller',
      objectNamespace: 'ingress-nginx',
      jsonPath: '.status.loadBalancer.ingress[0].hostname'
    });
    new cdk.CfnOutput(this, 'AWS ELB Domain', {value: awsElbAddress.value});

    if (props.basedDomain != '') {
      // Setup DNS record by AWS ELB
      const hostedZone =  route53.HostedZone.fromLookup(this, 'Domain', {
        domainName: props.basedDomain
      });
      new route53.ARecord(this, 'ARecord', {
        zone: hostedZone,
        recordName: `*.${clusterName}.${props.basedDomain}.`,
        target: route53.RecordTarget.fromAlias({
          bind() {
            return {
              dnsName: awsElbAddress.value,
              hostedZoneId: 'Z31USIVHYNEOWT',
            };
          },
        }),
      });
      primehubDomain = `hub.${clusterName}.${props.basedDomain}`;
    } else {
      primehubDomain = awsElbAddress.value;
    }

    const primehub = new PrimeHub(this, 'primehub', {
      eksCluster: eksCluster,
      clusterName: clusterName,
      primehubDomain: primehubDomain,
      primehubPassword: props.primehubPassword,
      keycloakPassword: props.keycloakPassword,
      account: account,
      region: region
    });

    const primehubReadyHelmCharts = new cdk.ConcreteDependable();
    primehubReadyHelmCharts.add(ingressNginx);
    primehubReadyHelmCharts.add(certManager);
    primehub.node.addDependency(primehubReadyHelmCharts);

    new cdk.CfnOutput(this, 'PrimeHub URL', {value: `https://${primehubDomain}`});
    new cdk.CfnOutput(this, 'PrimeHub Account', {value: 'phadmin'});
    new cdk.CfnOutput(this, 'PrimeHub Password', {value: props.primehubPassword});
    new cdk.CfnOutput(this, 'Keycloak Account', {value: 'keycloak'});
    new cdk.CfnOutput(this, 'Keycloak Password', {value: props.keycloakPassword});

    cdk.Tags.of(eksCluster).add('owner', props.username);
    cdk.Tags.of(eksCluster).add('clusterName', clusterName);
    cdk.Tags.of(eksCluster).add('clusterType', 'dev-eks');
  }
}
