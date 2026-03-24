package com.scroogebank.crm.client_service.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.services.sns.SnsClient;
import software.amazon.awssdk.services.sns.model.PublishRequest;
import software.amazon.awssdk.services.sns.model.PublishResponse;

import java.util.Map;

import com.scroogebank.crm.client_service.exception.SnsPublishException;;

@Component
public class SnsEmailPublisherService {

    private static final Logger LOGGER = LoggerFactory.getLogger(SnsEmailPublisherService.class);

    private final SnsClient snsClient;
    private final ObjectMapper objectMapper;
    private final String verificationTopicArn;

    public SnsEmailPublisherService(
        SnsClient snsClient,
        ObjectMapper objectMapper,
        @Value("${aws.sns.verification-topic-arn}") String verificationTopicArn
    ) {
        this.snsClient           = snsClient;
        this.objectMapper        = objectMapper;
        this.verificationTopicArn = verificationTopicArn;
    }

    /**
     * Publishes a VERIFICATION_REQUESTED event to SNS.
     * The Lambda subscribed to the topic will handle SES sending.
     *
     * @param clientId  public client identifier
     * @param email     recipient email address
     * @param token     verification token when client send back the documents
     * @param firstName recipient first name (used in email greeting)
     * @param requestId correlation ID for tracing
     */
    public void publishVerificationEmail(
        String clientId,
        String email,
        String token,
        String firstName,
        String requestId
    ) {
        Map<String, Object> payload = Map.of(
            "eventType",  "UPLOAD_VERIFICATION_REQUESTED",
            "clientId",   clientId,
            "email",      email,
            "token",      token,
            "firstName",  firstName != null ? firstName : "",
            "requestId",  requestId != null ? requestId : ""
        );

        String messageJson;
        try {
            messageJson = objectMapper.writeValueAsString(payload);
        } catch (Exception e) {
            throw new SnsPublishException("Failed to serialize SNS payload for clientId=" + clientId, e);
        }

        PublishRequest publishRequest = PublishRequest.builder()
            .topicArn(verificationTopicArn)
            .message(messageJson)
            .subject("UPLOAD_VERIFICATION_REQUESTED") // optional but useful for SNS filtering/logs
            .build();

        PublishResponse response = snsClient.publish(publishRequest);

        LOGGER.info(
            "Published UPLOAD_VERIFICATION_REQUESTED to SNS clientId={} requestId={} messageId={}",
            clientId, requestId, response.messageId()
        );
    }
}