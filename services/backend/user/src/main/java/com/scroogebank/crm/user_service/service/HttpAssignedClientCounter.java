package com.scroogebank.crm.user_service.service;

import java.net.http.HttpClient;
import java.time.Duration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import com.scroogebank.crm.user_service.exception.DownstreamDependencyException;

/**
 * Calls client-service to count assigned clients for archive guardrails.
 */
@Component
public class HttpAssignedClientCounter implements AssignedClientCounter {
	private static final Logger LOGGER = LoggerFactory.getLogger(HttpAssignedClientCounter.class);

	private final RestClient restClient;

	public HttpAssignedClientCounter(
		@Value("${app.client-service-url:http://localhost:8080}") String clientServiceUrl
	) {
		HttpClient httpClient = HttpClient.newBuilder()
			.connectTimeout(Duration.ofSeconds(5))
			.build();
		JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
		requestFactory.setReadTimeout(Duration.ofSeconds(5));
		this.restClient = RestClient.builder()
			.requestFactory(requestFactory)
			.baseUrl(clientServiceUrl)
			.build();
	}

	@Override
	public long countAssignedClients(String assignedUserId, String authorizationHeader, String correlationId) {
		try {
			CountResponse response = restClient.get()
				.uri(uriBuilder -> uriBuilder
					.path("/api/clients/count")
					.queryParam("assignedUserId", assignedUserId)
					.build())
				.header("Authorization", authorizationHeader)
				.header("X-Request-ID", correlationId == null ? "" : correlationId)
				.retrieve()
				.body(CountResponse.class);
			return response == null ? 0L : response.count();
		}
		catch (RestClientResponseException ex) {
			String message = "Failed to validate assigned clients before archive";
			LOGGER.warn("{}: status={} body={}", message, ex.getStatusCode(), ex.getResponseBodyAsString());
			throw new DownstreamDependencyException(message);
		}
		catch (Exception ex) {
			LOGGER.warn("Failed to validate assigned clients before archive", ex);
			throw new DownstreamDependencyException("Failed to validate assigned clients before archive");
		}
	}

	private record CountResponse(long count) {}
}

