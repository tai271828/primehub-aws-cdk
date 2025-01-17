import cdk = require('@aws-cdk/core');
import * as crypto from 'crypto';

import { EKSCluster } from '../lib/eks-cluster-Stack';

const app = new cdk.App();
const env = {
  account:  process.env.CDK_DEFAULT_ACCOUNT || '',
  region:   app.node.tryGetContext('region') || process.env.CDK_DEFAULT_REGION || '',
};
const username = app.node.tryGetContext('username') || process.env.USERNAME || 'dev@infuseai.io';
const name = app.node.tryGetContext('name') || process.env.NAME || 'cdk';
const primehubMode = app.node.tryGetContext('primehubMode') || process.env.PRIMEHUB_MODE || 'ee';
const basedDomain = app.node.tryGetContext('basedDomain') || process.env.AWS_BASED_DOMAIN || '';
const primehubVersion = app.node.tryGetContext('primehubVersion') || null;
const primehubPassword = app.node.tryGetContext('primehubPassword') || process.env.PH_PASSWORD || crypto.randomBytes(32).toString('hex');
const keycloakPassword = app.node.tryGetContext('keycloakPassword') || process.env.KC_PASSWORD || crypto.randomBytes(32).toString('hex');
const zone = app.node.tryGetContext('zone') || 'a';
const cpuInstance = app.node.tryGetContext('cpuInstance') || 't3a.xlarge';
const gpuInstance = app.node.tryGetContext('gpuInstance') || 'g4dn.xlarge';
const systemInstance = app.node.tryGetContext('systemInstance') || 't3a.xlarge';
const k8sInfraOnly = app.node.tryGetContext('k8sInfraOnly') || 'false';
const cpuDesiredCapacity = parseInt(app.node.tryGetContext('cpuDesiredCapacity') || '0', 10) ;
const gpuDesiredCapacity = parseInt(app.node.tryGetContext('gpuDesiredCapacity') || '0', 10) ;
const cpuMaxCapacity = parseInt(app.node.tryGetContext('cpuMaxCapacity') || '2', 10) ;
const gpuMaxCapacity = parseInt(app.node.tryGetContext('gpuMaxCapacity') || '2', 10) ;


const eksStackName = `eks-${name}-cdk-stack`;
const eksClusterStack = new EKSCluster(app, eksStackName , {
  env: env,
  name: name,
  username: username,
  primehubMode: primehubMode,
  basedDomain: basedDomain,
  keycloakPassword: keycloakPassword,
  primehubPassword: primehubPassword,
  availabilityZone: `${env.region}${zone}`,
  cpuInstance: cpuInstance,
  gpuInstance: gpuInstance,
  systemInstance: systemInstance,
  cpuDesiredCapacity: cpuDesiredCapacity,
  gpuDesiredCapacity: gpuDesiredCapacity,
  cpuMaxCapacity: cpuMaxCapacity,
  gpuMaxCapacity: gpuMaxCapacity,
  k8sInfraOnly: k8sInfraOnly,
  primehubVersion: primehubVersion,
});

eksClusterStack.templateOptions.description = `Setup AWS EKS environment with PrimeHub by AWS CDK.
The PrimeHub access information will show in the 'Outputs' tab once the stack status of '${eksStackName}' becomes CREATE_COMPLETE.
For more information, please visit: https://github.com/InfuseAI/primehub-aws-cdk`;

cdk.Tags.of(eksClusterStack).add("owner", username);
cdk.Tags.of(eksClusterStack).add("clusterType", 'dev-eks');

app.synth();
