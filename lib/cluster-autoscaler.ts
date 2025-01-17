import * as cdk from '@aws-cdk/core';
import * as eks from '@aws-cdk/aws-eks';

export interface ClusterAutoScalerProps {
    eksCluster: eks.ICluster,
    version: string,
}

export class ClusterAutoScaler extends cdk.Construct {
    constructor(
        scope: cdk.Construct,
        id: string,
        props: ClusterAutoScalerProps
    ) {
        super(scope,id)

        new eks.KubernetesManifest(this, id, {
            cluster: props.eksCluster,
            manifest: [
              {
                apiVersion: "v1",
                kind: "ServiceAccount",
                metadata: {
                  name: "cluster-autoscaler",
                  namespace: "kube-system",
                  labels: {
                    "k8s-addon": "cluster-autoscaler.addons.k8s.io",
                    "k8s-app": "cluster-autoscaler",
                  },
                },
              },
              {
                apiVersion: "rbac.authorization.k8s.io/v1",
                kind: "ClusterRole",
                metadata: {
                  name: "cluster-autoscaler",
                  namespace: "kube-system",
                  labels: {
                    "k8s-addon": "cluster-autoscaler.addons.k8s.io",
                    "k8s-app": "cluster-autoscaler",
                  },
                },
                rules: [
                  {
                    apiGroups: [""],
                    resources: ["events", "endpoints"],
                    verbs: ["create", "patch"],
                  },
                  {
                    apiGroups: [""],
                    resources: ["pods/eviction"],
                    verbs: ["create"],
                  },
                  {
                    apiGroups: [""],
                    resources: ["pods/status"],
                    verbs: ["update"],
                  },
                  {
                    apiGroups: [""],
                    resources: ["endpoints"],
                    resourceNames: ["cluster-autoscaler"],
                    verbs: ["get", "update"],
                  },
                  {
                    apiGroups: ["coordination.k8s.io"],
                    resources: ["leases"],
                    verbs: ["watch", "list", "get", "patch", "create", "update"],
                  },
                  {
                    apiGroups: [""],
                    resources: ["nodes"],
                    verbs: ["watch", "list", "get", "update"],
                  },
                  {
                    apiGroups: [""],
                    resources: ["pods", "services", "replicationcontrollers", "persistentvolumeclaims", "persistentvolumes"],
                    verbs: ["watch", "list", "get"],
                  },
                  {
                    apiGroups: ["extensions"],
                    resources: ["replicasets", "daemonsets"],
                    verbs: ["watch", "list", "get"],
                  },
                  {
                    apiGroups: ["policy"],
                    resources: ["poddisruptionbudgets"],
                    verbs: ["watch", "list"],
                  },
                  {
                    apiGroups: ["apps"],
                    resources: ["statefulsets", "replicasets", "daemonsets"],
                    verbs: ["watch", "list", "get"],
                  },
                  {
                    apiGroups: ["storage.k8s.io"],
                    resources: ["storageclasses", "csinodes", "csistoragecapacities", "csidrivers"],
                    verbs: ["watch", "list", "get"],
                  },
                  {
                    apiGroups: ["batch", "extensions"],
                    resources: ["jobs"],
                    verbs: ["get", "list", "watch", "patch"],
                  },
                ],
              },
              {
                apiVersion: "rbac.authorization.k8s.io/v1",
                kind: "Role",
                metadata: {
                  name: "cluster-autoscaler",
                  namespace: "kube-system",
                  labels: {
                    "k8s-addon": "cluster-autoscaler.addons.k8s.io",
                    "k8s-app": "cluster-autoscaler",
                  },
                },
                rules: [
                  {
                    apiGroups: [""],
                    resources: ["configmaps"],
                    verbs: ["create", "list", "watch"],
                  },
                  {
                    apiGroups: [""],
                    resources: ["configmaps"],
                    resourceNames: ["cluster-autoscaler-status", "cluster-autoscaler-priority-expander"],
                    verbs: ["delete", "get", "update", "watch"],
                  },
                ],
              },
              {
                apiVersion: "rbac.authorization.k8s.io/v1",
                kind: "ClusterRoleBinding",
                metadata: {
                  name: "cluster-autoscaler",
                  namespace: "kube-system",
                  labels: {
                    "k8s-addon": "cluster-autoscaler.addons.k8s.io",
                    "k8s-app": "cluster-autoscaler",
                  },
                },
                roleRef: {
                  apiGroup: "rbac.authorization.k8s.io",
                  kind: "ClusterRole",
                  name: "cluster-autoscaler",
                },
                subjects: [
                  {
                    kind: "ServiceAccount",
                    name: "cluster-autoscaler",
                    namespace: "kube-system",
                  },
                ],
              },
              {
                apiVersion: "rbac.authorization.k8s.io/v1",
                kind: "RoleBinding",
                metadata: {
                  name: "cluster-autoscaler",
                  namespace: "kube-system",
                  labels: {
                    "k8s-addon": "cluster-autoscaler.addons.k8s.io",
                    "k8s-app": "cluster-autoscaler",
                  },
                },
                roleRef: {
                  apiGroup: "rbac.authorization.k8s.io",
                  kind: "Role",
                  name: "cluster-autoscaler",
                },
                subjects: [
                  {
                    kind: "ServiceAccount",
                    name: "cluster-autoscaler",
                    namespace: "kube-system",
                  },
                ],
              },
              {
                apiVersion: "apps/v1",
                kind: "Deployment",
                metadata: {
                  name: "cluster-autoscaler",
                  namespace: "kube-system",
                  labels: {
                    app: "cluster-autoscaler",
                  },
                  annotations: {
                    "cluster-autoscaler.kubernetes.io/safe-to-evict": "false",
                  },
                },
                spec: {
                  replicas: 1,
                  selector: {
                    matchLabels: {
                      app: "cluster-autoscaler",
                    },
                  },
                  template: {
                    metadata: {
                      labels: {
                        app: "cluster-autoscaler",
                      },
                      annotations: {
                        "prometheus.io/scrape": "true",
                        "prometheus.io/port": "8085",
                      },
                    },
                    spec: {
                      serviceAccountName: "cluster-autoscaler",
                      containers: [
                        {
                          image: "k8s.gcr.io/autoscaling/cluster-autoscaler:" + props.version,
                          name: "cluster-autoscaler",
                          resources: {
                            limits: {
                              cpu: "100m",
                              memory: "500Mi",
                            },
                            requests: {
                              cpu: "100m",
                              memory: "300Mi",
                            },
                          },
                          command: [
                            "./cluster-autoscaler",
                            "--v=4",
                            "--stderrthreshold=info",
                            "--cloud-provider=aws",
                            "--skip-nodes-with-local-storage=false",
                            "--expander=least-waste",
                            "--node-group-auto-discovery=asg:tag=k8s.io/cluster-autoscaler/enabled,k8s.io/cluster-autoscaler/" +
                            props.eksCluster.clusterName,
                            "--balance-similar-node-groups",
                            "--skip-nodes-with-system-pods=false",
                          ],
                          volumeMounts: [
                            {
                              name: "ssl-certs",
                              mountPath: "/etc/ssl/certs/ca-certificates.crt",
                              readOnly: true,
                            },
                          ],
                          imagePullPolicy: "Always",
                        },
                      ],
                      volumes: [
                        {
                          name: "ssl-certs",
                          hostPath: {
                            path: "/etc/ssl/certs/ca-bundle.crt",
                          },
                        },
                      ],
                    },
                  },
                },
              },
            ],
        });
    }
}
