package com.scroogebank.crm.client_service.service;

import java.util.Base64;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.ServerSideEncryption;

@Service
public class DocumentStorageService {

    private static final Pattern SAFE_FILENAME_PATTERN = Pattern.compile("^[A-Za-z0-9._-]{1,120}$");
    private static final Map<String, String> ALLOWED_MIME_TYPES = Map.of(
        "image/jpeg", "jpg",
        "image/png", "png",
        "application/pdf", "pdf"
    );

    private final S3Client s3Client;
    private final String bucket;
    private final int maxDocumentBytes;

    public DocumentStorageService(
        S3Client s3Client,
        @Value("${app.verification.documents-bucket}") String bucket,
        @Value("${app.verification.max-document-bytes:5242880}") Integer maxDocumentBytes
    ) {
        this.s3Client = s3Client;
        this.bucket = bucket;
        this.maxDocumentBytes =
            maxDocumentBytes != null && maxDocumentBytes > 0 ? maxDocumentBytes : 5 * 1024 * 1024;
    }

    /**
     * Decodes a base64 string and uploads it to S3.
     *
     * @param clientId  used to namespace the S3 key
     * @param category  e.g. "primary" or "address"
     * @param fileName  original filename
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
        String configuredBucket = bucket == null ? "" : bucket.trim();
        if (configuredBucket.isEmpty()) {
            throw new IllegalStateException("VERIFICATION_DOCUMENTS_BUCKET must be configured for verification document uploads.");
        }

        String normalizedMimeType = normalizeMimeType(mimeType);
        String fileExtension = ALLOWED_MIME_TYPES.get(normalizedMimeType);
        if (fileExtension == null) {
            throw new IllegalArgumentException("Unsupported MIME type for " + category + " document");
        }
        sanitizeFileName(fileName);

        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(base64);
        }
        catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid base64 content for " + category + " document", e);
        }
        if (bytes.length == 0) {
            throw new IllegalArgumentException("Empty content for " + category + " document");
        }
        if (bytes.length > maxDocumentBytes) {
            throw new IllegalArgumentException("Document exceeds maximum allowed size for " + category + " document");
        }
        verifyMagicBytes(normalizedMimeType, bytes, category);

        // Avoid raw filename metadata in key paths.
        String key = "clients/%s/%s/%s.%s".formatted(clientId, category, UUID.randomUUID(), fileExtension);

        PutObjectRequest putRequest = PutObjectRequest.builder()
            .bucket(configuredBucket)
            .key(key)
            .contentType(normalizedMimeType)
            .contentLength((long) bytes.length)
            .serverSideEncryption(ServerSideEncryption.AES256)
            .build();

        s3Client.putObject(putRequest, RequestBody.fromBytes(bytes));

        return key;
    }

    /**
     * Downloads a stored verification document from S3.
     *
     * @param key object key in the verification bucket
     * @return bytes and inferred MIME metadata
     */
    public StoredDocument download(String key) {
        String configuredBucket = bucket == null ? "" : bucket.trim();
        if (configuredBucket.isEmpty()) {
            throw new IllegalStateException("VERIFICATION_DOCUMENTS_BUCKET must be configured for verification document uploads.");
        }
        if (key == null || key.isBlank()) {
            throw new IllegalArgumentException("Verification document reference is missing");
        }

        ResponseBytes<GetObjectResponse> objectBytes = s3Client.getObjectAsBytes(
            GetObjectRequest.builder()
                .bucket(configuredBucket)
                .key(key)
                .build()
        );

        String mimeType = normalizeMimeType(objectBytes.response().contentType());
        if (!ALLOWED_MIME_TYPES.containsKey(mimeType)) {
            mimeType = inferMimeTypeFromKey(key);
        }
        return new StoredDocument(objectBytes.asByteArray(), mimeType);
    }

    private static String inferMimeTypeFromKey(String key) {
        String lower = key.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
            return "image/jpeg";
        }
        if (lower.endsWith(".png")) {
            return "image/png";
        }
        if (lower.endsWith(".pdf")) {
            return "application/pdf";
        }
        return "application/octet-stream";
    }

    private static String normalizeMimeType(String mimeType) {
        return mimeType == null ? "" : mimeType.trim().toLowerCase(Locale.ROOT);
    }

    private static void sanitizeFileName(String fileName) {
        if (fileName == null || !SAFE_FILENAME_PATTERN.matcher(fileName).matches()) {
            throw new IllegalArgumentException("Invalid document file name");
        }
    }

    private static void verifyMagicBytes(String mimeType, byte[] bytes, String category) {
        boolean matches = switch (mimeType) {
            case "application/pdf" -> hasPdfHeader(bytes);
            case "image/jpeg" -> hasJpegHeader(bytes);
            case "image/png" -> hasPngHeader(bytes);
            default -> false;
        };
        if (!matches) {
            throw new IllegalArgumentException("Document content does not match MIME type for " + category + " document");
        }
    }

    private static boolean hasPdfHeader(byte[] bytes) {
        return bytes.length >= 5
            && bytes[0] == 0x25
            && bytes[1] == 0x50
            && bytes[2] == 0x44
            && bytes[3] == 0x46
            && bytes[4] == 0x2D;
    }

    private static boolean hasJpegHeader(byte[] bytes) {
        return bytes.length >= 3
            && (bytes[0] & 0xFF) == 0xFF
            && (bytes[1] & 0xFF) == 0xD8
            && (bytes[2] & 0xFF) == 0xFF;
    }

    private static boolean hasPngHeader(byte[] bytes) {
        return bytes.length >= 8
            && (bytes[0] & 0xFF) == 0x89
            && bytes[1] == 0x50
            && bytes[2] == 0x4E
            && bytes[3] == 0x47
            && bytes[4] == 0x0D
            && bytes[5] == 0x0A
            && bytes[6] == 0x1A
            && bytes[7] == 0x0A;
    }

    public record StoredDocument(byte[] bytes, String mimeType) {}
}
