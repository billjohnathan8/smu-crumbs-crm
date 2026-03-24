package com.scroogebank.crm.client_service.communication;

import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * HTTP implementation for communication operations against the log service API.
 */
@Component
public class HttpLogServiceCommunicationClient implements LogServiceCommunicationClient {
	private final RestClient logServiceRestClient;

	public HttpLogServiceCommunicationClient(RestClient logServiceRestClient) {
		this.logServiceRestClient = logServiceRestClient;
	}

	@Override
	public CommunicationRecord createCommunication(
		CreateCommunicationRequest request,
		String authorizationHeader
	) {
		return logServiceRestClient.post()
			.uri("/api/communications")
			.header(HttpHeaders.AUTHORIZATION, authorizationHeader)
			.contentType(MediaType.APPLICATION_JSON)
			.body(request)
			.retrieve()
			.body(CommunicationRecord.class);
	}

	@Override
	public List<CommunicationRecord> listQueuedCommunications(
		int limit,
		String authorizationHeader
	) {
		CommunicationsListResponse response = logServiceRestClient.get()
			.uri(uriBuilder -> uriBuilder.path("/api/communications/queued")
				.queryParam("limit", limit)
				.build())
			.header(HttpHeaders.AUTHORIZATION, authorizationHeader)
			.retrieve()
			.body(CommunicationsListResponse.class);
		return response == null || response.data() == null ? List.of() : response.data();
	}

	@Override
	public CommunicationRecord updateCommunicationStatus(
		String communicationId,
		UpdateCommunicationStatusRequest request,
		String authorizationHeader
	) {
		return logServiceRestClient.patch()
			.uri("/api/communications/{communicationId}/status", communicationId)
			.header(HttpHeaders.AUTHORIZATION, authorizationHeader)
			.contentType(MediaType.APPLICATION_JSON)
			.body(request)
			.retrieve()
			.body(CommunicationRecord.class);
	}

	@Override
	public CommunicationRecord updateCommunicationStatusByProviderMessageId(
		String providerMessageId,
		UpdateCommunicationStatusRequest request,
		String authorizationHeader
	) {
		return logServiceRestClient.patch()
			.uri("/api/communications/provider/{providerMessageId}/status", providerMessageId)
			.header(HttpHeaders.AUTHORIZATION, authorizationHeader)
			.contentType(MediaType.APPLICATION_JSON)
			.body(request)
			.retrieve()
			.body(CommunicationRecord.class);
	}
}
