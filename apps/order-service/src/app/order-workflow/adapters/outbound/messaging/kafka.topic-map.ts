import { KafkaTopics } from 'contracts';

import type { OrderEventInstanceUnion } from 'contracts';

export const OrderServiceTopicMap: Record<
  OrderEventInstanceUnion['eventName'],
  KafkaTopics
> = {
  AllResponsesReceived: KafkaTopics.AllResponsesReceived,
  AllStagesCompleted: KafkaTopics.StageTransitions,
  Cancelled: KafkaTopics.OrderTransitions,
  InvitationAccepted: KafkaTopics.OrderTransitions,
  InvitationDeclined: KafkaTopics.InvitationDeclined,
  AllInvitationsDeclined: KafkaTopics.AllInvitationsDeclined,
  OrderCompleted: KafkaTopics.OrderTransitions,
  OrderPlaced: KafkaTopics.OrderTransitions,
  RequestEdited: KafkaTopics.RequestEdited,
  StageConfirmationMarked: KafkaTopics.StageTransitions,
  StageConfirmed: KafkaTopics.StageTransitions,
  OrderCancelled: KafkaTopics.OrderTransitions,
  OrderMarkedAsCompleted: KafkaTopics.OrderTransitions,
  InvitationConfirmed: KafkaTopics.OrderTransitions,
} as const;
