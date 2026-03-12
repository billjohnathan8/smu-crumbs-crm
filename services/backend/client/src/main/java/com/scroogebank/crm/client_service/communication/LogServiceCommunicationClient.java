package com.scroogebank.crm.client_service.communication;

import java.util.List;

/**
 * Abstraction for communication persistence/status operations in log service.
 */
public interface LogServiceCommunicationClient {
	CommunicationRecord createCommunication(
		CreateCommunicationRequest request,
		String authorizationHeader
	);

	List<CommunicationRecord> listQueuedCommunications(int limit, String authorizationHeader);

	CommunicationRecord updateCommunicationStatus(
		String communicationId,
		UpdateCommunicationStatusRequest request,
		String authorizationHeader
	);

	CommunicationRecord updateCommunicationStatusByProviderMessageId(
		String providerMessageId,
		UpdateCommunicationStatusRequest request,
		String authorizationHeader
	);
}
