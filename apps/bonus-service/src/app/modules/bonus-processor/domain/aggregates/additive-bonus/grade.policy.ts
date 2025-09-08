import { assertNonNegativePoints } from './assert-non-negative-points.assertion';

export abstract class GradePolicyAttributes {
  abstract readonly policyName: 'GradePolicy';
  readonly registry: Record<GradeName, GradeInfo>;
  readonly version: number;
  readonly defaultGrade: GradeName;
}

type GradePolicyMethods = {
  getGradeByPoints(this: GradePolicyInterface, points: number): GradeName;
};

export type GradePolicyInterface = GradePolicyAttributes & GradePolicyMethods;

export enum GradeName {
  Bronze = 'Bronze',
  Silver = 'Silver',
  Gold = 'Gold',
  Platinum = 'Platinum',
}

// It's supposed to be a single policy implementation at any time in code.
// Version-controlled via git, but have to increment version
// manually for busines logic.
export const GradePolicy: GradePolicyInterface & GradePolicyMethods = {
  policyName: 'GradePolicy',
  registry: {
    [GradeName.Bronze]: { startThreshold: 0 },
    [GradeName.Silver]: { startThreshold: 100 },
    [GradeName.Gold]: { startThreshold: 300 },
    [GradeName.Platinum]: { startThreshold: 1000 },
  },
  defaultGrade: GradeName.Bronze,
  version: 1,

  getGradeByPoints(this: GradePolicyInterface, points: number): GradeName {
    assertNonNegativePoints({ points });

    const gradeNames = Object.values(GradeName) as GradeName[];
    let currentGrade: {
      name: GradeName;
      threshold: number;
    } = {
      name: this.defaultGrade,

      threshold: 0,
    };

    // Amount of grades is expected to be < 5, so, building a B-tree is actually
    // less performant
    for (const name of gradeNames) {
      const threshold = this.registry[name].startThreshold;
      if (threshold <= points && threshold >= currentGrade.threshold) {
        currentGrade = {
          name: name,
          threshold: threshold,
        };
      }
    }

    return currentGrade.name;
  },
};

export class GradeInfo {
  startThreshold: number;
}
