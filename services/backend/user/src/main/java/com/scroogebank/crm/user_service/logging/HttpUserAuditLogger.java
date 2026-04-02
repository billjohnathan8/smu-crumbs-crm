package com.scroogebank.crm.user_service.logging;

import java.time.Instant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * HTTP-backed audit logger that posts to the Lambda-backed log API.
 */
@Component
public class HttpUserAuditLogger implements UserAuditLogger {
	private static final Logger LOGGER = LoggerFactory.getLogger(HttpUserAuditLogger.class);

	private final RestClient logServiceRestClient;

	public HttpUserAuditLogger(RestClient logServiceRestClient) {
		this.logServiceRestClient = logServiceRestClient;
	}

	@Async
	@Override
	public void logAuditEvent(
		String action,
		String attributeName,
		String beforeValue,
		String afterValue,
		String userId,
		String clientId,
		String correlationId,
		String authorizationHeader
	) {
		try {
			LogEventRequest request = new LogEventRequest(
				action, attributeName, beforeValue, afterValue, userId, clientId, Instant.now(), correlationId
			);

			logServiceRestClient.post()
				.uri("/api/logs")
				.header(HttpHeaders.AUTHORIZATION, authorizationHeader)
				.contentType(MediaType.APPLICATION_JSON)
				.body(request)
				.retrieve()
				.toBodilessEntity();

			LOGGER.debug("Published audit log action={} targetUserId={}", action, clientId);
		} catch (Exception ex) {
			LOGGER.warn("Failed to send audit log: {}", ex.getMessage());
		}
	}
}
