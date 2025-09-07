export abstract class MessageProducerPort<
  message extends { eventName: string },
> {
  abstract dispatch(events: Array<message> | undefined): Promise<void>;
}
