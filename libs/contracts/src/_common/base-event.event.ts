export interface BaseEvent<N extends string> {
  eventId: string;
  eventName: N;
  schemaV: number;
}
