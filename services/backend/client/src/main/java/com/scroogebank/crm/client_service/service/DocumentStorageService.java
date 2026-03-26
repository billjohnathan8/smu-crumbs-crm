package com.scroogebank.crm.client_service.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.ServerSideEncryption;

import java.util.Base64;

@Service
public class DocumentStorageService {

    private final S3Client s3Client;

    public DocumentStorageService(S3Client s3Client) {
        this.s3Client = s3Client;
    }

    @Value("${app.s3.bucket:${APP_S3_BUCKET:scroogebank-crm-dev-verification}}")
    private String bucket;

    /**
     * Decodes a base64 string and uploads it to S3.
     *
     * @param clientId  used to namespace the S3 key
     * @param category  e.g. "primary" or "address"
     * @param fileName  original filename (used as suffix in the key)
     * @param base64    base64-encoded file content
     * @param mimeType  MIME type of the file
     * @return the S3 key the file was stored under
     */
    public String upload(
        String clientId,
        String category,
        String fileName,
        String base64,
        String mimeType
    ) {
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(base64);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException(
                "Invalid base64 content for " + category + " document", e);
        }

        // e.g. clients/clt_abc123/primary/passport.pdf
        String key = "clients/%s/%s/%s".formatted(clientId, category, fileName);

        PutObjectRequest putRequest = PutObjectRequest.builder()
            .bucket(bucket)
            .key(key)
            .contentType(mimeType)
            .contentLength((long) bytes.length)
            .serverSideEncryption(ServerSideEncryption.AES256)
            .build();

        s3Client.putObject(putRequest, RequestBody.fromBytes(bytes));

        return key;
    }
}
