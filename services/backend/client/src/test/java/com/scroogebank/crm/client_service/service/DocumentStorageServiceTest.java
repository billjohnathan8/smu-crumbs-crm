package com.scroogebank.crm.client_service.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;

import java.util.Base64;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.ServerSideEncryption;

@ExtendWith(MockitoExtension.class)
class DocumentStorageServiceTest {

    @Mock
    private S3Client s3Client;

    private DocumentStorageService documentStorageService;

    private static final String BUCKET = "test-kyc-bucket";
    private static final String CLIENT_ID = "clt_abc123";
    private static final String CATEGORY = "primary";
    private static final String MIME_TYPE = "image/jpeg";

    private static final byte[] JPEG_BYTES = new byte[] {
        (byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0x10, 0x20, 0x30
    };
    private static final String JPEG_BASE64 = Base64.getEncoder().encodeToString(JPEG_BYTES);

    @BeforeEach
    void setUp() {
        documentStorageService = new DocumentStorageService(s3Client, BUCKET, 5 * 1024 * 1024);
    }

    @Test
    void upload_returnsNamespacedKeyWithoutOriginalFilename() {
        String key = documentStorageService.upload(CLIENT_ID, CATEGORY, "nric_front.jpg", JPEG_BASE64, MIME_TYPE);
        assertThat(key).startsWith("clients/clt_abc123/primary/");
        assertThat(key).endsWith(".jpg");
        assertThat(key).doesNotContain("nric_front.jpg");
    }

    @Test
    void upload_putRequestUsesCorrectBucketAndSecuritySettings() {
        ArgumentCaptor<PutObjectRequest> captor = ArgumentCaptor.forClass(PutObjectRequest.class);
        documentStorageService.upload(CLIENT_ID, CATEGORY, "nric_front.jpg", JPEG_BASE64, MIME_TYPE);

        verify(s3Client).putObject(captor.capture(), any(RequestBody.class));
        assertThat(captor.getValue().bucket()).isEqualTo(BUCKET);
        assertThat(captor.getValue().contentType()).isEqualTo("image/jpeg");
        assertThat(captor.getValue().contentLength()).isEqualTo((long) JPEG_BYTES.length);
        assertThat(captor.getValue().serverSideEncryption()).isEqualTo(ServerSideEncryption.AES256);
    }

    @Test
    void upload_invalidBase64_throwsIllegalArgumentException() {
        assertThatThrownBy(() ->
            documentStorageService.upload(CLIENT_ID, CATEGORY, "nric_front.jpg", "!!!bad!!!", MIME_TYPE)
        ).isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("Invalid base64 content");
    }

    @Test
    void upload_mimeSpoofing_throwsIllegalArgumentException() {
        byte[] pngBytes = new byte[] {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};
        String pngBase64 = Base64.getEncoder().encodeToString(pngBytes);

        assertThatThrownBy(() ->
            documentStorageService.upload(CLIENT_ID, CATEGORY, "nric_front.jpg", pngBase64, "application/pdf")
        ).isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("does not match MIME type");
    }

    @Test
    void upload_oversizedFile_throwsIllegalArgumentException() {
        DocumentStorageService smallLimitService = new DocumentStorageService(s3Client, BUCKET, 2);
        assertThatThrownBy(() ->
            smallLimitService.upload(CLIENT_ID, CATEGORY, "nric_front.jpg", JPEG_BASE64, MIME_TYPE)
        ).isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("exceeds maximum allowed size");
    }

    @Test
    void upload_invalidFileName_throwsIllegalArgumentException() {
        assertThatThrownBy(() ->
            documentStorageService.upload(CLIENT_ID, CATEGORY, "../secret.jpg", JPEG_BASE64, MIME_TYPE)
        ).isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("Invalid document file name");
    }

    @Test
    void upload_withoutConfiguredBucket_throwsIllegalStateException() {
        DocumentStorageService serviceWithoutBucket = new DocumentStorageService(s3Client, "   ", 1024);
        assertThatThrownBy(() ->
            serviceWithoutBucket.upload(CLIENT_ID, CATEGORY, "nric_front.jpg", JPEG_BASE64, MIME_TYPE)
        ).isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("VERIFICATION_DOCUMENTS_BUCKET");
    }
}
