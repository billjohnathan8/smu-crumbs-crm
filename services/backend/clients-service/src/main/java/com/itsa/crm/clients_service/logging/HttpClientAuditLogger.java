package com.itsa.crm.clients_service.logging;

import com.itsa.crm.clients_service.dto.ClientPayload;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class HttpClientAuditLogger implements ClientAuditLogger {
	private static final Logger LOGGER = LoggerFactory.getLogger(HttpClientAuditLogger.class);

	private final RestClient logServiceRestClient;

	public HttpClientAuditLogger(RestClient logServiceRestClient) {
		this.logServiceRestClient = logServiceRestClient;
	}

	@Override
	public void logClientEvent(String action, Long clientId, String agentId, ClientPayload payload) {
		Map<String, Object> eventPayload = new HashMap<>();
		eventPayload.put("emailAddress", payload.emailAddress());
		eventPayload.put("phoneNumber", payload.phoneNumber());
		eventPayload.put("city", payload.city());
		eventPayload.put("country", payload.country());

		LogEventRequest request = new LogEventRequest(
			"clients-service",
			action,
			"CLIENT",
			clientId,
			agentId,
			"Client " + action.toLowerCase() + " operation",
			eventPayload,
			Instant.now()
		);

		logServiceRestClient.post()
			.contentType(org.springframework.http.MediaType.APPLICATION_JSON)
			.body(request)
			.retrieve()
			.toBodilessEntity();

		LOGGER.debug("Published client audit event action={} clientId={}", action, clientId);
	}
}