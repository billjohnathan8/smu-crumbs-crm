package com.scroogebank.crm.client_service.service;


import com.scroogebank.crm.client_service.communication.LogServiceCommunicationClient;
import com.scroogebank.crm.client_service.exception.SnsPublishException;
import tools.jackson.databind.json.JsonMapper;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.sns.SnsClient;
import software.amazon.awssdk.services.sns.model.PublishRequest;
import software.amazon.awssdk.services.sns.model.PublishResponse;

import java.util.Map;

import org.mockito.ArgumentCaptor;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;

class SnsEmailPublisherServiceTest {

    private static final String TOPIC_ARN = "arn:aws:sns:us-east-1:123456789012:client-verification-topic";
    private static final String CLIENT_ID  = "client_abc123";
    private static final String EMAIL      = "jane.doe@example.com";
    private static final String TOKEN      = "eyJjbGllbnRJZCI6ImNsdF9hYmMxMjMifQ.mocksig";
    private static final String FIRST_NAME = "Jane";
    private static final String REQUEST_ID = "req_test_001";
    private static final long TOKEN_TTL_SECONDS = 7200L;

    private final SnsClient snsClient = mock(SnsClient.class);
    private final LogServiceCommunicationClient communicationClient = mock(LogServiceCommunicationClient.class);
    private final JsonMapper objectMapper = new JsonMapper();
    private SnsEmailPublisherService publisher;

    @BeforeEach
    public void setUp() {
        publisher = new SnsEmailPublisherService(snsClient, objectMapper, communicationClient, TOPIC_ARN);

        when(snsClient.publish(any(PublishRequest.class)))
            .thenReturn(PublishResponse.builder().messageId("mock-sns-message-id").build());
    }

    // -------------------------------------------------------------------------
    // Topic + routing
    // -------------------------------------------------------------------------

    @Test
    void publishVerificationEmail_sendsToCorrectTopic() throws Exception {
        publisher.publishVerificationEmail(CLIENT_ID, EMAIL, TOKEN, FIRST_NAME, REQUEST_ID, TOKEN_TTL_SECONDS);

        ArgumentCaptor<PublishRequest> captor = ArgumentCaptor.forClass(PublishRequest.class);
        verify(snsClient, times(1)).publish(captor.capture());

        PublishRequest sent = captor.getValue();
        assertThat(sent.topicArn()).isEqualTo(TOPIC_ARN);
    }

    @Test
    void publishVerificationEmail_subjectIsUploadVerificationRequested() {
        publisher.publishVerificationEmail(CLIENT_ID, EMAIL, TOKEN, FIRST_NAME, REQUEST_ID, TOKEN_TTL_SECONDS);

        ArgumentCaptor<PublishRequest> captor = ArgumentCaptor.forClass(PublishRequest.class);
        verify(snsClient).publish(captor.capture());
        assertThat(captor.getValue().subject()).isEqualTo("UPLOAD_VERIFICATION_REQUESTED");
    }

    @Test
    void publishVerificationEmail_snsClientCalledExactlyOnce() {
        publisher.publishVerificationEmail(CLIENT_ID, EMAIL, TOKEN, FIRST_NAME, REQUEST_ID, TOKEN_TTL_SECONDS);

        verify(snsClient, times(1)).publish(any(PublishRequest.class));
    }

    // -------------------------------------------------------------------------
    // Payload fields
    // -------------------------------------------------------------------------
    @Test
    void publishVerificationEmail_subjectCorrectEventType() throws Exception {
        publisher.publishVerificationEmail(CLIENT_ID, EMAIL, TOKEN, FIRST_NAME, REQUEST_ID, TOKEN_TTL_SECONDS);

        Map<?, ?> payload = capturePayload();
        assertThat(payload.get("eventType")).isEqualTo("UPLOAD_VERIFICATION_REQUESTED");
    }

    @Test
    void publishVerificationEmail_payloadContainsAllRequiredFields() throws Exception {
        publisher.publishVerificationEmail(CLIENT_ID, EMAIL, TOKEN, FIRST_NAME, REQUEST_ID, TOKEN_TTL_SECONDS);

        Map<?, ?> payload = capturePayload();
        assertThat(payload.get("clientId")).isEqualTo(CLIENT_ID);
        assertThat(payload.get("email")).isEqualTo(EMAIL);
        assertThat(payload.get("token")).isEqualTo(TOKEN);
        assertThat(payload.get("firstName")).isEqualTo(FIRST_NAME);
        assertThat(payload.get("requestId")).isEqualTo(REQUEST_ID);
        assertThat(payload.get("tokenTtlSeconds")).isEqualTo((int) TOKEN_TTL_SECONDS);
    }

    // -------------------------------------------------------------------------
    // Null safety
    // -------------------------------------------------------------------------
    @Test
    void publishVerificationEmail_handlesNullFirstName_gracefully() throws Exception {
        publisher.publishVerificationEmail(CLIENT_ID, EMAIL, TOKEN, null, REQUEST_ID, TOKEN_TTL_SECONDS);

        Map<?, ?> payload = capturePayload();
        assertThat(payload.get("firstName")).isEqualTo("");   // null coerced to ""
    }

    @Test
    void publishVerificationEmail_nullRequestId_coercedToEmptyString() throws Exception {
        publisher.publishVerificationEmail(CLIENT_ID, EMAIL, TOKEN, FIRST_NAME, null, TOKEN_TTL_SECONDS);

        assertThat(capturePayload().get("requestId")).isEqualTo("");
    }

    @Test
    void publishVerificationEmail_withoutConfiguredTopicArn_throws() {
        SnsEmailPublisherService service = new SnsEmailPublisherService(snsClient, objectMapper, communicationClient, "   ");

        assertThatThrownBy(() ->
            service.publishVerificationEmail(CLIENT_ID, EMAIL, TOKEN, FIRST_NAME, REQUEST_ID, TOKEN_TTL_SECONDS)
        ).isInstanceOf(SnsPublishException.class);

        verify(snsClient, never()).publish(any(PublishRequest.class));
    }

    @Test
    void publishVerificationEmail_whenSnsClientThrows_propagatesAsSnsPublishException() {
        reset(snsClient);
        when(snsClient.publish(any(PublishRequest.class))).thenThrow(new RuntimeException("sns down"));

        assertThatThrownBy(() ->
            publisher.publishVerificationEmail(CLIENT_ID, EMAIL, TOKEN, FIRST_NAME, REQUEST_ID, TOKEN_TTL_SECONDS)
        ).isInstanceOf(SnsPublishException.class);
    }

    // -------------------------------------------------------------------------
    // Helper
    // -------------------------------------------------------------------------

    private Map<?, ?> capturePayload() throws Exception {
        ArgumentCaptor<PublishRequest> captor = ArgumentCaptor.forClass(PublishRequest.class);
        verify(snsClient, atLeastOnce()).publish(captor.capture());
        return objectMapper.readValue(captor.getValue().message(), Map.class);
    }
}
