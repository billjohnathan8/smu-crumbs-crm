package com.scroogebank.crm.user_service.service;

/**
 * Provides assigned-client counts for agent archival precondition checks.
 */
@FunctionalInterface
public interface AssignedClientCounter {
	long countAssignedClients(String assignedUserId, String authorizationHeader, String correlationId);
}

