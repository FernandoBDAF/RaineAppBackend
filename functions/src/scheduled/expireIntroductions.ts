import * as functions from "firebase-functions/v1";
import * as logger from "firebase-functions/logger";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {db} from "../utils/helpers";
import {ConnectionStatus, IntroductionStatus} from "../types";

const OVERDUE_INTRO_STATUSES: IntroductionStatus[] = [
  "active",
  "requested",
  "dismissed",
];

const CANCELABLE_CONNECTION_STATUSES: ConnectionStatus[] = [
  "pending",
  "dismissed",
];

export const expireIntroductions = functions
  .region("us-west2")
  .pubsub.schedule("0 * * * *")
  .onRun(async () => {
    const now = Timestamp.now();
    let expiredCount = 0;
    let connectionsCanceled = 0;

    logger.info("Starting introduction expiration run", {
      checkedStatuses: OVERDUE_INTRO_STATUSES,
    });

    try {
      const snapshot = await db
        .collection("introductions")
        .where("expiresAt", "<=", now)
        .where("status", "in", OVERDUE_INTRO_STATUSES)
        .limit(500)
        .get();

      if (snapshot.empty) {
        logger.info("No overdue introductions found");
        return;
      }

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const batch = db.batch();

        batch.update(doc.ref, {
          status: "expired" as IntroductionStatus,
          updatedAt: FieldValue.serverTimestamp(),
        });

        const connectionId = data.connectionId as string | null | undefined;
        if (connectionId) {
          const connRef = db.collection("connections").doc(connectionId);
          const connDoc = await connRef.get();

          if (connDoc.exists) {
            const connStatus = connDoc.data()?.status as ConnectionStatus | undefined;
            if (connStatus && CANCELABLE_CONNECTION_STATUSES.includes(connStatus)) {
              batch.update(connRef, {
                status: "canceled" as ConnectionStatus,
                updatedAt: FieldValue.serverTimestamp(),
              });
              connectionsCanceled++;
            }
          }
        }

        await batch.commit();
        expiredCount++;
      }

      logger.info("expireIntroductions completed", {
        overdueCount: snapshot.size,
        expiredCount,
        connectionsCanceled,
      });
    } catch (error) {
      logger.error("expireIntroductions failed", {
        error: error instanceof Error ? error.message : "Unknown error",
        expiredCount,
        connectionsCanceled,
      });
      throw error;
    }
  });
