export abstract class VipProfileRegistryInterface {
  readonly policyName: 'VipProfileRegistry';
  readonly vipThreshold: number;
  readonly version: number;
}

//No need to store all of those in the code, only the latest - there will be no "replay"
export const VipProfileRegistry: VipProfileRegistryInterface = {
  policyName: 'VipProfileRegistry',
  vipThreshold: 200,
  version: 1,
};
