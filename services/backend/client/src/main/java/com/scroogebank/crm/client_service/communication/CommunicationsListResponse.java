package com.scroogebank.crm.client_service.communication;

import java.util.List;

/**
 * List response wrapper returned by log-service communication listing endpoints.
 */
public record CommunicationsListResponse(List<CommunicationRecord> data) {}
