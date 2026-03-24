package com.scroogebank.crm.client_service.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.scroogebank.crm.client_service.service.SnsEmailPublisherService;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import software.amazon.awssdk.services.sns.SnsClient;
import software.amazon.awssdk.services.sns.model.PublishRequest;
import software.amazon.awssdk.services.sns.model.PublishResponse;

import java.util.Map;

import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class SnsEmailPublisherServiceTest {

    private static final String TOPIC_ARN = "arn:aws:sns:us-east-1:123456789012:client-verification-topic";
    private static final String CLIENT_ID  = "client_abc123";
    private static final String EMAIL      = "jane.doe@example.com";
    private static final String TOKEN      = "eyJjbGllbnRJZCI6ImNsdF9hYmMxMjMifQ.mocksig";
    private static final String FIRST_NAME = "Jane";
    private static final String REQUEST_ID = "req_test_001";

    @Mock
    private SnsClient snsClient;

    private SnsEmailPublisherService publisher;
    private ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        publisher    = new SnsEmailPublisherService(snsClient, objectMapper, TOPIC_ARN);

        when(snsClient.publish(any(PublishRequest.class)))
            .thenReturn(PublishResponse.builder().messageId("mock-sns-message-id").build());
    }

    // -------------------------------------------------------------------------
    // Topic + routing
    // -------------------------------------------------------------------------

    @Test
    void publishVerificationEmail_sendsToCorrectTopic() throws Exception {
        publisher.publishVerificationEmail(CLIENT_ID, EMAIL, TOKEN, FIRST_NAME, REQUEST_ID);

        ArgumentCaptor<PublishRequest> captor = ArgumentCaptor.forClass(PublishRequest.class);
        verify(snsClient, times(1)).publish(captor.capture());

        PublishRequest sent = captor.getValue();
        assertThat(sent.topicArn()).isEqualTo(TOPIC_ARN);
    }

    @Test
    void publishVerificationEmail_subjectIsUploadVerificationRequested() {
        publisher.publishVerificationEmail(CLIENT_ID, EMAIL, TOKEN, FIRST_NAME, REQUEST_ID);

        ArgumentCaptor<PublishRequest> captor = ArgumentCaptor.forClass(PublishRequest.class);
        verify(snsClient).publish(captor.capture());
        assertThat(captor.getValue().subject()).isEqualTo("UPLOAD_VERIFICATION_REQUESTED");
    }

    @Test
    void publishVerificationEmail_snsClientCalledExactlyOnce() {
        publisher.publishVerificationEmail(CLIENT_ID, EMAIL, TOKEN, FIRST_NAME, REQUEST_ID);

        verify(snsClient, times(1)).publish(any(PublishRequest.class));
    }

    // -------------------------------------------------------------------------
    // Payload fields
    // -------------------------------------------------------------------------
    @Test
    void publishVerificationEmail_subjectCorrectEventType() throws Exception {
        publisher.publishVerificationEmail(CLIENT_ID, EMAIL, TOKEN, FIRST_NAME, REQUEST_ID);

        Map<?, ?> payload = capturePayload();
        assertThat(payload.get("eventType")).isEqualTo("UPLOAD_VERIFICATION_REQUESTED");
    }

    @Test
    void publishVerificationEmail_payloadContainsAllRequiredFields() throws Exception {
        publisher.publishVerificationEmail(CLIENT_ID, EMAIL, TOKEN, FIRST_NAME, REQUEST_ID);

        Map<?, ?> payload = capturePayload();
        assertThat(payload.get("clientId")).isEqualTo(CLIENT_ID);
        assertThat(payload.get("email")).isEqualTo(EMAIL);
        assertThat(payload.get("token")).isEqualTo(TOKEN);
        assertThat(payload.get("firstName")).isEqualTo(FIRST_NAME);
        assertThat(payload.get("requestId")).isEqualTo(REQUEST_ID);
    }

    // -------------------------------------------------------------------------
    // Null safety
    // -------------------------------------------------------------------------
    @Test
    void publishVerificationEmail_handlesNullFirstName_gracefully() throws Exception {
        publisher.publishVerificationEmail(CLIENT_ID, EMAIL, TOKEN, null, REQUEST_ID);

        Map<?, ?> payload = capturePayload();
        assertThat(payload.get("firstName")).isEqualTo("");   // null coerced to ""
    }

    @Test
    void publishVerificationEmail_nullRequestId_coercedToEmptyString() throws Exception {
        publisher.publishVerificationEmail(CLIENT_ID, EMAIL, TOKEN, FIRST_NAME, null);

        assertThat(capturePayload().get("requestId")).isEqualTo("");
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
