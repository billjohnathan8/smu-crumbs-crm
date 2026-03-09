package com.scroogebank.crm.client_service.logging;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * HTTP-backed audit logger that posts to the log service.
 */
@Component
public class HttpClientAuditLogger implements ClientAuditLogger {
	private static final Logger LOGGER = LoggerFactory.getLogger(HttpClientAuditLogger.class);
	private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

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
		String requestBody = toJsonBody(
			action,
			attributeName,
			beforeValue,
			afterValue,
			agentId,
			clientId,
			Instant.now(),
			correlationId
		);

		logServiceRestClient.post()
			.uri("/api/logs")
			.header(HttpHeaders.AUTHORIZATION, authorizationHeader)
			.contentType(org.springframework.http.MediaType.APPLICATION_JSON)
			.body(requestBody)
			.retrieve()
			.toBodilessEntity();

		LOGGER.debug("Published audit log action={} clientId={}", action, clientId);
	}

	private String toJsonBody(
		String action,
		String attributeName,
		String beforeValue,
		String afterValue,
		String agentId,
		String clientId,
		Instant dateTime,
		String correlationId
	) {
		Map<String, Object> payload = new LinkedHashMap<>();
		payload.put("action", action);
		payload.put("attributeName", attributeName);
		payload.put("beforeValue", beforeValue);
		payload.put("afterValue", afterValue);
		payload.put("agentId", agentId);
		payload.put("clientId", clientId);
		payload.put("dateTime", dateTime.toString());
		payload.put("correlationId", correlationId);

		try {
			return OBJECT_MAPPER.writeValueAsString(payload);
		} catch (JsonProcessingException ex) {
			throw new IllegalStateException("Unable to serialize audit log payload", ex);
		}
	}
}
