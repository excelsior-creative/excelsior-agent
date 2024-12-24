import { Plugin } from "@elizaos/core";
import { ticketsProvider } from "./providers/tickets.ts";

export const freshdeskPlugin: Plugin = {
    name: "freshdesk",
    description: "Freshdesk plugin",
    actions: [],
    evaluators: [],
    providers: [ticketsProvider],
};
