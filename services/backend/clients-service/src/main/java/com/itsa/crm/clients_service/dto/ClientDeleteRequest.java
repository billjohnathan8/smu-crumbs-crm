package com.itsa.crm.clients_service.dto;

/**
 * Request payload for deleting a client on behalf of an agent.
 */
public record ClientDeleteRequest(
	String agentId
) {}
