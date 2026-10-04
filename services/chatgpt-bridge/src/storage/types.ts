import type { Snapshot, Event } from "../domain/model.js";
import { z } from "zod";
import {
  historySchema,
  activitySchema,
  decisionSchema,
  diagnosticSchema,
  diagnosticGroupSchema,
  validationSchema,
} from "../domain/model.js";
export type Query = {
  project_id: string;
  session_id?: string;
  limit: number;
  cursor?: string;
  since?: string;
  until?: string;
  category?: string;
  event_type?: string;
  state?: string;
  severity?: string;
  kind?: string;
  status?: string;
  group_by_problem?: boolean;
};
export type Page<T> = { items: T[]; next_cursor: string | null };
export type SchemaHealth = {
  storage: "reachable" | "unavailable";
  schema: "compatible" | "incompatible" | "unverified";
};
export interface Storage {
  snapshot(): Promise<Snapshot>;
  events(
    project: string,
    session: string | undefined,
    type: string | undefined,
    limit: number,
    before?: string,
  ): Promise<Event[]>;
  checkSchema(): Promise<SchemaHealth>;
  sessionHistory(query: Query): Promise<Page<z.infer<typeof historySchema>>>;
  activity(query: Query): Promise<Page<z.infer<typeof activitySchema>>>;
  decisions(query: Query): Promise<Page<z.infer<typeof decisionSchema>>>;
  diagnostics(
    query: Query,
  ): Promise<
    Page<
      z.infer<typeof diagnosticSchema> | z.infer<typeof diagnosticGroupSchema>
    >
  >;
  validations(query: Query): Promise<Page<z.infer<typeof validationSchema>>>;
  close(): Promise<void>;
}
