package com.scroogebank.crm.client_service.service;

import com.scroogebank.crm.client_service.communication.CommunicationRecord;
import com.scroogebank.crm.client_service.communication.CreateCommunicationRequest;
import com.scroogebank.crm.client_service.communication.LogServiceCommunicationClient;
import com.scroogebank.crm.client_service.exception.SnsPublishException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.services.sns.SnsClient;
import software.amazon.awssdk.services.sns.model.PublishRequest;
import software.amazon.awssdk.services.sns.model.PublishResponse;

import java.util.HashMap;
import java.util.Map;

import tools.jackson.databind.ObjectMapper;
import software.amazon.awssdk.services.sns.model.SnsException;

@Component
public class SnsEmailPublisherService {

    private static final Logger LOGGER = LoggerFactory.getLogger(SnsEmailPublisherService.class);

    private final SnsClient snsClient;
    private final ObjectMapper objectMapper;
    private final String verificationTopicArn;
    private final LogServiceCommunicationClient communicationClient;

    public SnsEmailPublisherService(
        SnsClient snsClient,
        ObjectMapper objectMapper,
        LogServiceCommunicationClient communicationClient,
        @Value("${verification.sns-topic-arn}") String verificationTopicArn
    ) {
        this.snsClient           = snsClient;
        this.objectMapper        = objectMapper;
        this.communicationClient = communicationClient;
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
     * @param tokenTtlSeconds verification token lifetime in seconds for user-facing expiry copy
     */
    public void publishVerificationEmail(
        String clientId,
        String email,
        String token,
        String firstName,
        String requestId,
        long tokenTtlSeconds
    ) {
        try {
            String topicArn = verificationTopicArn == null ? "" : verificationTopicArn.trim();
            if (topicArn.isEmpty()) {
                throw new SnsPublishException("VERIFICATION_SNS_TOPIC_ARN not configured");
            }

            Map<String, Object> payload = Map.of(
                "eventType",  "UPLOAD_VERIFICATION_REQUESTED",
                "clientId",   clientId,
                "email",      email,
                "token",      token,
                "firstName",  firstName != null ? firstName : "",
                "requestId",  requestId != null ? requestId : "",
                "tokenTtlSeconds", tokenTtlSeconds
            );

            String messageJson = objectMapper.writeValueAsString(payload);

            PublishRequest publishRequest = PublishRequest.builder()
                .topicArn(topicArn)
                .message(messageJson)
                .subject("UPLOAD_VERIFICATION_REQUESTED")
                .build();

            PublishResponse response = snsClient.publish(publishRequest);

            LOGGER.info(
                "Published UPLOAD_VERIFICATION_REQUESTED to SNS clientId={} requestId={} messageId={}",
                clientId, requestId, response.messageId()
            );
        } catch (SnsPublishException ex) {
            throw ex;
        } catch (SnsException ex) {
            throw new SnsPublishException("Failed to publish SNS verification email", ex);
        } catch (IllegalArgumentException ex) {
            throw new SnsPublishException("Invalid SNS verification email publish payload", ex);
        } catch (RuntimeException ex) {
            throw new SnsPublishException("Unexpected SNS verification email publish failure", ex);
        }
    }

    /**
     * Publishes a CLIENT_INFO_UPDATED event to SNS.
     * Creates a communication record and sends email notification to the client.
     *
     * @param clientId  public client identifier
     * @param email     recipient email address
     * @param firstName recipient first name
     * @param lastName  recipient last name
     * @param requestId correlation ID for tracing
     * @param authorizationHeader bearer token for communication API
     */
    public void publishClientInfoUpdated(
        String clientId,
        String email,
        String firstName,
        String lastName,
        String requestId,
        String authorizationHeader
    ) {
        try {
            String topicArn = verificationTopicArn == null ? "" : verificationTopicArn.trim();
            if (topicArn.isEmpty()) {
                throw new SnsPublishException("VERIFICATION_SNS_TOPIC_ARN not configured");
            }

            // Create communication record for tracking
            String communicationId = null;
            try {
                CreateCommunicationRequest commRequest = new CreateCommunicationRequest(
                    clientId,
                    "SYSTEM",
                    email,
                    "[ScroogeBank CRM] Your information has been updated",
                    "Confirmation that your account information has been updated.",
                    "email",
                    "client-info-updated-" + clientId + "-" + System.currentTimeMillis()
                );
                CommunicationRecord record = communicationClient.createCommunication(commRequest, authorizationHeader);
                communicationId = record.id();
            } catch (Exception ex) {
                LOGGER.warn("Failed to create communication record for CLIENT_INFO_UPDATED clientId={}", clientId, ex);
            }

            Map<String, Object> payload = new HashMap<>();
            payload.put("eventType", "CLIENT_INFO_UPDATED");
            payload.put("clientId", clientId);
            payload.put("email", email);
            payload.put("firstName", firstName != null ? firstName : "");
            payload.put("lastName", lastName != null ? lastName : "");
            payload.put("requestId", requestId != null ? requestId : "");
            if (communicationId != null) {
                payload.put("communicationId", communicationId);
            }

            String messageJson = objectMapper.writeValueAsString(payload);

            PublishRequest publishRequest = PublishRequest.builder()
                .topicArn(topicArn)
                .message(messageJson)
                .subject("CLIENT_INFO_UPDATED")
                .build();

            PublishResponse response = snsClient.publish(publishRequest);

            LOGGER.info(
                "Published CLIENT_INFO_UPDATED to SNS clientId={} communicationId={} requestId={} messageId={}",
                clientId, communicationId, requestId, response.messageId()
            );
        } catch (SnsPublishException ex) {
            throw ex;
        } catch (SnsException ex) {
            throw new SnsPublishException("Failed to publish SNS client info updated notification", ex);
        } catch (IllegalArgumentException ex) {
            throw new SnsPublishException("Invalid SNS client info updated publish payload", ex);
        } catch (RuntimeException ex) {
            throw new SnsPublishException("Unexpected SNS client info updated publish failure", ex);
        }
    }

    /**
     * Publishes a VERIFICATION_APPROVED event to SNS.
     * The Lambda subscribed to the topic will send an approval email to the client.
     *
     * @param clientId  public client identifier
     * @param email     recipient email address
     * @param firstName recipient first name
     * @param lastName  recipient last name
     * @param requestId correlation ID for tracing
     */
    public void publishVerificationApproved(
        String clientId,
        String email,
        String firstName,
        String lastName,
        String requestId
    ) {
        try {
            String topicArn = verificationTopicArn == null ? "" : verificationTopicArn.trim();
            if (topicArn.isEmpty()) {
                throw new SnsPublishException("VERIFICATION_SNS_TOPIC_ARN not configured");
            }

            Map<String, Object> payload = Map.of(
                "eventType",  "VERIFICATION_APPROVED",
                "clientId",   clientId,
                "email",      email,
                "firstName",  firstName != null ? firstName : "",
                "lastName",   lastName != null ? lastName : "",
                "requestId",  requestId != null ? requestId : ""
            );

            String messageJson = objectMapper.writeValueAsString(payload);

            PublishRequest publishRequest = PublishRequest.builder()
                .topicArn(topicArn)
                .message(messageJson)
                .subject("VERIFICATION_APPROVED")
                .build();

            PublishResponse response = snsClient.publish(publishRequest);

            LOGGER.info(
                "Published VERIFICATION_APPROVED to SNS clientId={} requestId={} messageId={}",
                clientId, requestId, response.messageId()
            );
        } catch (SnsPublishException ex) {
            throw ex;
        } catch (SnsException ex) {
            throw new SnsPublishException("Failed to publish SNS verification approved notification", ex);
        } catch (IllegalArgumentException ex) {
            throw new SnsPublishException("Invalid SNS verification approved publish payload", ex);
        } catch (RuntimeException ex) {
            throw new SnsPublishException("Unexpected SNS verification approved publish failure", ex);
        }
    }

    /**
     * Publishes a VERIFICATION_REJECTED event to SNS.
     * The Lambda subscribed to the topic will send a rejection email to the client.
     *
     * @param clientId  public client identifier
     * @param email     recipient email address
     * @param firstName recipient first name
     * @param lastName  recipient last name
     * @param requestId correlation ID for tracing
     */
    public void publishVerificationRejected(
        String clientId,
        String email,
        String firstName,
        String lastName,
        String requestId
    ) {
        try {
            String topicArn = verificationTopicArn == null ? "" : verificationTopicArn.trim();
            if (topicArn.isEmpty()) {
                throw new SnsPublishException("VERIFICATION_SNS_TOPIC_ARN not configured");
            }

            Map<String, Object> payload = Map.of(
                "eventType",  "VERIFICATION_REJECTED",
                "clientId",   clientId,
                "email",      email,
                "firstName",  firstName != null ? firstName : "",
                "lastName",   lastName != null ? lastName : "",
                "requestId",  requestId != null ? requestId : ""
            );

            String messageJson = objectMapper.writeValueAsString(payload);

            PublishRequest publishRequest = PublishRequest.builder()
                .topicArn(topicArn)
                .message(messageJson)
                .subject("VERIFICATION_REJECTED")
                .build();

            PublishResponse response = snsClient.publish(publishRequest);

            LOGGER.info(
                "Published VERIFICATION_REJECTED to SNS clientId={} requestId={} messageId={}",
                clientId, requestId, response.messageId()
            );
        } catch (SnsPublishException ex) {
            throw ex;
        } catch (SnsException ex) {
            throw new SnsPublishException("Failed to publish SNS verification rejected notification", ex);
        } catch (IllegalArgumentException ex) {
            throw new SnsPublishException("Invalid SNS verification rejected publish payload", ex);
        } catch (RuntimeException ex) {
            throw new SnsPublishException("Unexpected SNS verification rejected publish failure", ex);
        }
    }
}
