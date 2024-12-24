import {
    elizaLogger,
    IAgentRuntime,
    Memory,
    Provider,
    State,
} from "@elizaos/core";
import axios from "axios";
import { FreshDeskTicket } from "../types/FreshDeskTicket";

export enum EnumFreshdeskTicketStatus {
    Open = 2,
    Pending = 3,
    Resolved = 4,
    Closed = 5,
    WaitingOnCustomer = 6,
    WaitingOnDevTeam = 8,
}

// Constants
const TICKET_KEYWORDS = [
    "tickets",
    "support tickets",
    "open tickets",
    "pending tickets",
    "unresolved tickets",
    "customer support",
    "help desk",
] as const;

// Helper functions
const containsTicketKeyword = (text: string): boolean => {
    return TICKET_KEYWORDS.some((keyword) =>
        text.toLowerCase().includes(keyword.toLowerCase())
    );
};

const formatTicketsResponse = (tickets: FreshDeskTicket[]): string => {
    if (!tickets.length) {
        return "No unresolved tickets found.";
    }

    let response = "🎫 Current Unresolved Tickets\n\n";

    tickets.forEach((ticket) => {
        response += `Ticket #${ticket.id}: ${ticket.subject}\n`;
        response += `• Status: ${EnumFreshdeskTicketStatus[ticket.status]}\n`;
        response += `• Priority: ${ticket.priority}\n`;
        response += `• Created: ${new Date(ticket.created_at).toLocaleString()}\n`;
        response += `• Updated: ${new Date(ticket.updated_at).toLocaleString()}\n\n`;
    });

    return response.trim();
};

export const ticketsProvider: Provider = {
    get: async (runtime: IAgentRuntime, message: Memory, _state?: State) => {
        const apiKey = runtime.getSetting("FRESHDESK_API_KEY");
        if (!apiKey) {
            elizaLogger.error(
                "FRESHDESK_API_KEY not found in runtime settings"
            );
            return null;
        }

        const messageText = message.content.text;

        if (!containsTicketKeyword(messageText)) {
            return null;
        }

        elizaLogger.info("TICKETS provider activated");

        const tickets = await getUnresolvedTickets(runtime);
        return formatTicketsResponse(tickets);
    },
};

// get freshdesk unresolved tickets
export const getUnresolvedTickets = async (
    runtime: IAgentRuntime
): Promise<FreshDeskTicket[]> => {
    try {
        const apiEndpoint = runtime.getSetting("FRESHDESK_API_URL");
        const apiKey = runtime.getSetting("FRESHDESK_API_KEY");
        const response = await axios.get(
            `${apiEndpoint}/search/tickets?query="status:2 OR status:3 OR status:6 OR status:8"`,
            {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
                auth: {
                    username: apiKey,
                    password: "x",
                },
            }
        );

        return response.data.results as FreshDeskTicket[];
    } catch (error) {
        console.error("Error fetching unresolved tickets:", error);
        throw error;
    }
};
