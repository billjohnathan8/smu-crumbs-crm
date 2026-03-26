package com.scroogebank.crm.transaction_service.logging;

import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * HTTP-backed audit logger that posts transaction events to the log API.
 */
@Component
public class HttpTransactionAuditLogger implements TransactionAuditLogger {
	private static final Logger LOGGER = LoggerFactory.getLogger(HttpTransactionAuditLogger.class);

	private final RestClient logServiceRestClient;

	public HttpTransactionAuditLogger(@Qualifier("logServiceRestClient") RestClient logServiceRestClient) {
		this.logServiceRestClient = logServiceRestClient;
	}

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
		if (authorizationHeader == null || authorizationHeader.isBlank()) {
			return;
		}
		try {
			LogEventRequest request = new LogEventRequest(
				action,
				attributeName,
				beforeValue,
				afterValue,
				userId,
				clientId,
				Instant.now(),
				correlationId
			);
			logServiceRestClient.post()
				.uri("/api/logs")
				.header(HttpHeaders.AUTHORIZATION, authorizationHeader)
				.contentType(MediaType.APPLICATION_JSON)
				.body(request)
				.retrieve()
				.toBodilessEntity();
		}
		catch (Exception ex) {
			LOGGER.warn(
				"Transaction operation completed but audit logging failed. action={} clientId={}",
				action,
				clientId,
				ex
			);
		}
	}
}

