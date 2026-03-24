package com.scroogebank.crm.client_service.email;

import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

/**
 * Unit tests for {@link VerificationEmailDispatchWorker}.
 */
class VerificationEmailDispatchWorkerTest {
	@Test
	void processQueuedCommunications_delegatesToDispatchService() {
		VerificationEmailDispatchService dispatchService = mock(VerificationEmailDispatchService.class);
		VerificationEmailDispatchWorker worker = new VerificationEmailDispatchWorker(dispatchService);

		worker.processQueuedCommunications();

		verify(dispatchService).processQueuedCommunications();
	}

	@Test
	void processQueuedCommunications_swallowsDispatchExceptions() {
		VerificationEmailDispatchService dispatchService = mock(VerificationEmailDispatchService.class);
		doThrow(new RuntimeException("dispatch failed")).when(dispatchService).processQueuedCommunications();
		VerificationEmailDispatchWorker worker = new VerificationEmailDispatchWorker(dispatchService);

		worker.processQueuedCommunications();

		verify(dispatchService).processQueuedCommunications();
	}
}
