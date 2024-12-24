import {
    elizaLogger,
    IAgentRuntime,
    Memory,
    Provider,
    State,
} from "@elizaos/core";
import axios from "axios";
import { FreshDeskTicket } from "../types/FreshDeskTicket";

interface FreshDeskAgent {
    id: number;
    contact: {
        name: string;
        email: string;
    };
}

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
    "freshdesk",
] as const;

// Helper functions
const containsTicketKeyword = (text: string): boolean => {
    return TICKET_KEYWORDS.some((keyword) =>
        text.toLowerCase().includes(keyword.toLowerCase())
    );
};

const extractTicketId = (text: string): number | null => {
    // Look for patterns like "ticket #123", "#123", "ticket 123"
    const patterns = [
        /ticket #(\d+)/i,
        /#(\d+)/i,
        /ticket (\d+)/i,
        /ticket id (\d+)/i,
        /ticket number (\d+)/i,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            return parseInt(match[1], 10);
        }
    }
    return null;
};

const getAgents = async (runtime: IAgentRuntime): Promise<FreshDeskAgent[]> => {
    try {
        const apiEndpoint = runtime.getSetting("FRESHDESK_API_URL");
        const apiKey = runtime.getSetting("FRESHDESK_API_KEY");
        const response = await axios.get(`${apiEndpoint}/agents`, {
            headers: {
                "Content-Type": "application/json",
            },
            auth: {
                username: apiKey,
                password: "x",
            },
        });

        return response.data as FreshDeskAgent[];
    } catch (error) {
        console.error("Error fetching agents:", error);
        return [];
    }
};

const formatTicketsResponse = async (
    tickets: FreshDeskTicket[],
    runtime: IAgentRuntime
): Promise<string> => {
    if (!tickets.length) {
        return "No unresolved tickets found.";
    }

    // Fetch agents to map IDs to names
    const agents = await getAgents(runtime);
    const agentMap = new Map(
        agents.map((agent) => [agent.id, agent.contact.name])
    );

    let response = "🎫 Current Unresolved Tickets\n\n";

    tickets.forEach((ticket) => {
        const assignedAgent = ticket.responder_id
            ? agentMap.get(ticket.responder_id) ||
              `Agent ${ticket.responder_id}`
            : "Unassigned";
        response += `Ticket #${ticket.id}: ${ticket.subject}\n`;
        response += `• Status: ${EnumFreshdeskTicketStatus[ticket.status]}\n`;
        response += `• Priority: ${ticket.priority}\n`;
        response += `• Assigned To: ${assignedAgent}\n`;
        response += `• Created: ${new Date(ticket.created_at).toLocaleString()}\n`;
        response += `• Updated: ${new Date(ticket.updated_at).toLocaleString()}\n\n`;
    });

    return response.trim();
};

const formatSingleTicketResponse = async (
    ticket: FreshDeskTicket,
    runtime: IAgentRuntime
): Promise<string> => {
    // Fetch agents to map IDs to names
    const agents = await getAgents(runtime);
    const agentMap = new Map(
        agents.map((agent) => [agent.id, agent.contact.name])
    );

    const assignedAgent = ticket.responder_id
        ? agentMap.get(ticket.responder_id) || `Agent ${ticket.responder_id}`
        : "Unassigned";

    let response = `🎫 Detailed Ticket Information\n\n`;
    response += `Ticket #${ticket.id}: ${ticket.subject}\n`;
    response += `• Status: ${EnumFreshdeskTicketStatus[ticket.status]}\n`;
    response += `• Priority: ${ticket.priority}\n`;
    response += `• Assigned To: ${assignedAgent}\n`;
    response += `• Created: ${new Date(ticket.created_at).toLocaleString()}\n`;
    response += `• Updated: ${new Date(ticket.updated_at).toLocaleString()}\n`;
    response += `• Description:\n${ticket.description_text || "No description provided."}\n\n`;

    if (ticket.tags && ticket.tags.length > 0) {
        response += `• Tags: ${ticket.tags.join(", ")}\n`;
    }

    if (ticket.custom_fields) {
        response += `• Custom Fields:\n`;
        Object.entries(ticket.custom_fields).forEach(([key, value]) => {
            if (value) {
                response += `  - ${key}: ${value}\n`;
            }
        });
    }

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

        // Check if the message contains a specific ticket ID
        const ticketId = extractTicketId(messageText);

        if (ticketId) {
            try {
                const ticket = await getTicket(ticketId, runtime, [
                    "description",
                ]);
                return formatSingleTicketResponse(ticket, runtime);
            } catch (error) {
                elizaLogger.error(`Error fetching ticket ${ticketId}:`, error);
                return `Unable to find ticket #${ticketId}. Please verify the ticket number and try again.`;
            }
        }

        // If no specific ticket ID, return all unresolved tickets
        const tickets = await getUnresolvedTickets(runtime);
        return formatTicketsResponse(tickets, runtime);
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

/**
 * Fetches a FreshDesk ticket by its ID.
 * @param {number} ticketId - The ID of the ticket.
 * @returns {Promise<FreshDeskTicket>} - The FreshDesk ticket.
 * @throws Will throw an error if the ticket cannot be retrieved.
 */
export const getTicket = async (
    ticketId: number,
    runtime: IAgentRuntime,
    include?: string[]
): Promise<FreshDeskTicket> => {
    try {
        const apiEndpoint = runtime.getSetting("FRESHDESK_API_URL");
        const apiKey = runtime.getSetting("FRESHDESK_API_KEY");

        let url = `${apiEndpoint}/tickets/${ticketId}`;

        // Add include parameters if specified
        if (include && include.length > 0) {
            url += `?include=${include.join(",")}`;
        }

        const response = await axios.get(url, {
            headers: {
                "Content-Type": "application/json",
            },
            auth: {
                username: apiKey,
                password: "x",
            },
        });

        return response.data as FreshDeskTicket;
    } catch (error) {
        console.error(`Error fetching ticket ${ticketId}:`, error);
        throw error;
    }
};
