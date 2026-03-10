package com.scroogebank.crm.client_service.logging;

import java.time.Instant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * HTTP-backed audit logger that posts to the log service.
 */
@Component
public class HttpClientAuditLogger implements ClientAuditLogger {
	private static final Logger LOGGER = LoggerFactory.getLogger(HttpClientAuditLogger.class);

	private final RestClient logServiceRestClient;

	public HttpClientAuditLogger(RestClient logServiceRestClient) {
		this.logServiceRestClient = logServiceRestClient;
	}

	@Override
	public void logAuditEvent(
		String action,
		String attributeName,
		String beforeValue,
		String afterValue,
		String agentId,
		String clientId,
		String correlationId,
		String authorizationHeader
	) {
		logServiceRestClient.post()
			.uri("/api/logs")
			.header(HttpHeaders.AUTHORIZATION, authorizationHeader)
			.contentType(MediaType.APPLICATION_JSON)
			.body(new LogEventRequest(action, attributeName, beforeValue, afterValue, agentId, clientId, Instant.now(), correlationId))
			.retrieve()
			.toBodilessEntity();

		LOGGER.debug("Published audit log action={} clientId={}", action, clientId);
	}
}
