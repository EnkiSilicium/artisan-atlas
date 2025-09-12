# Kafka's demise: MQ outage and graceful degradation
## Summary:

The purpose is to demonstrate the fallback mode illustrating the method called "graceful degradation": if the message broker (Apache Kafka) is not accessible, user commands to change the state of the order still complete successfully, but the publication of the associated events is delayed until connection is restored. That makes transient issues with the message broker invisible for the users while preserving system correctness.

>Other failure modes are also discussed below in the "What if not only Kafka is down" section.

This behavior is made possible by combination of 2 technical solutions:
1. **Outbox**: events are "enqueued" for publish as a part of DB transaction - "state changed" coincides with "event persisted" in 100% of cases, and the event can be, eventually, published into the system; The only unknowns left are how exactly they will be published and how long it will take. The fallback substitutes "how exactly" and stretches the "how long" to "when connection returns".
2. **Fallback publish job**: after the transaction **commits**, a post-commit dispatcher attempts to publish. The HTTP response is sent **after commit**; publish proceeds **asynchronously**. If publish fails, the fallback creates a job using BullMQ library (works on top of Redis), which keeps trying to publish the events with exponential backoff independently of the service lifecycle - all of that invisibly to the system users.

## Demo: bringing Kafka down

> [!WARNING]
> You won't be able to try this demo with "Redis as MQ" demo option, since disabling Redis will incapacitate both the MQ and the fallback path.

> Currently, tools to inspect Kafka, Redis and Postgres are not provided in the demo. While I am adding them, you may find very convenient extensions in your IDE. All infra-services exposed on standard ports; Postgres connection string: postgresql://app:app@localhost:5432/app

1. Run the stack. Please, read the instructions here: [run the services](run-the-services.md).
2. Now disable the Kafka container.
3. Open swagger API panel [here](localhost:3001) and create several orders. The request will be completed successfully, and in the logs of the order-service we will see errors indicating that the publish attempts have failed.
4. You can also verify that the "OrderCreated" events are now awaiting publish in the`outbox_message` table.
5. Make sure `bonus-service` is not receiving any events via logs.
6. Now turn Kafka back one. Within 30 seconds (backoff cap in demo) the outbox will be emptied completely, and events will be delivered to `bonus-service`

## What if not only Kafka is down?

Indeed, any of the infra-services the app depends upon may fail.
There are several possible combinations apart from "Kafka unavailable":
##### Database fails (Postgres) - no fallback; service is down:
The database is the system of record (aka source of truth) the app relies upon it to make decisions. If the data is inaccessible, there can't possibly be a fallback that would preserve the correctness of the workflow; in this case consistency of data clearly beats availability.

##### Redis fails - fallback not needed:
Since the initial publish does not rely on Redis but on Kafka and node.js runtime task queue, any event is successfully published regardless of Redis.
A more interesting case is the next one.

##### Both Kafka and Redis fail - fallback possible:
As mentioned, if Kafka is down, the immediate fallback relies on Redis. But even if Redis is also down, we still have events to publish persisted in the database, which opens the way for 2 options:
1. In-memory CRON "publish unpublished" job: it would, once per some interval, simply scan the outbox and publish whatever is there.
2. Publish routine on service startup: when a new service instance starts, it may scan the outbox and, again, publish whatever is unpublished.
There are **important caveats**: without locks on reads or sophisticated leases (or any other inter-instance orchestration), there is no way to determine if the outbox message is indeed "orphaned" or it's about to be published by another service instance, and so, the "publish all there is" will inevitably trigger event duplications.
However, "ensuring idempotency" is the foundational responsibility of any consumer within the system (either natural, where repeated events violate business logic, or via explicit deduplication), and so, duplicated events are taken care of.