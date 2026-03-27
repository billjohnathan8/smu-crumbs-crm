package com.scroogebank.crm.client_service.service;

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

import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class DocumentStorageServiceTest {

    @Mock
    private S3Client s3Client;

    private DocumentStorageService documentStorageService;

    private static final String BUCKET    = "test-kyc-bucket";
    private static final String CLIENT_ID = "clt_abc123";
    private static final String FILE_NAME = "nric_front.jpg";
    private static final String MIME_TYPE = "image/jpeg";
    private static final String CATEGORY  = "primary";

    // A known plaintext and its base64 encoding for deterministic assertions
    private static final byte[] FILE_BYTES  = "fake-image-content".getBytes();
    private static final String BASE64_DATA = Base64.getEncoder().encodeToString(FILE_BYTES);

    @BeforeEach
    void setUp() {
        documentStorageService = new DocumentStorageService(s3Client, BUCKET);
    }

    /** Verifies that upload() returns the correct namespaced S3 key. */
    @Test
    void upload_returnsCorrectS3Key() {
        String key = documentStorageService.upload(CLIENT_ID, CATEGORY, FILE_NAME, BASE64_DATA, MIME_TYPE);

        assertThat(key).isEqualTo("clients/clt_abc123/primary/nric_front.jpg");
    }

    /** Verifies that upload() constructs the S3 key using the pattern clients/{clientId}/{category}/{fileName}. */
    @Test
    void upload_keyFollowsNamespacingPattern() {
        String key = documentStorageService.upload("clt_xyz999", "address", "bill.pdf", BASE64_DATA, "application/pdf");

        assertThat(key).isEqualTo("clients/clt_xyz999/address/bill.pdf");
    }

    /** Verifies that upload() sends a PutObjectRequest with the correct bucket. */
    @Test
    void upload_putRequestUsesCorrectBucket() {
        ArgumentCaptor<PutObjectRequest> captor = ArgumentCaptor.forClass(PutObjectRequest.class);

        documentStorageService.upload(CLIENT_ID, CATEGORY, FILE_NAME, BASE64_DATA, MIME_TYPE);

        verify(s3Client).putObject(captor.capture(), any(RequestBody.class));
        assertThat(captor.getValue().bucket()).isEqualTo(BUCKET);
    }

    /** Verifies that upload() sends a PutObjectRequest with the correct S3 key. */
    @Test
    void upload_putRequestUsesCorrectKey() {
        ArgumentCaptor<PutObjectRequest> captor = ArgumentCaptor.forClass(PutObjectRequest.class);

        documentStorageService.upload(CLIENT_ID, CATEGORY, FILE_NAME, BASE64_DATA, MIME_TYPE);

        verify(s3Client).putObject(captor.capture(), any(RequestBody.class));
        assertThat(captor.getValue().key()).isEqualTo("clients/clt_abc123/primary/nric_front.jpg");
    }

    /** Verifies that upload() sends a PutObjectRequest with the correct MIME content type. */
    @Test
    void upload_putRequestUsesCorrectContentType() {
        ArgumentCaptor<PutObjectRequest> captor = ArgumentCaptor.forClass(PutObjectRequest.class);

        documentStorageService.upload(CLIENT_ID, CATEGORY, FILE_NAME, BASE64_DATA, MIME_TYPE);

        verify(s3Client).putObject(captor.capture(), any(RequestBody.class));
        assertThat(captor.getValue().contentType()).isEqualTo(MIME_TYPE);
    }

    /** Verifies that upload() sends a PutObjectRequest with the correct content length matching decoded bytes. */
    @Test
    void upload_putRequestUsesCorrectContentLength() {
        ArgumentCaptor<PutObjectRequest> captor = ArgumentCaptor.forClass(PutObjectRequest.class);

        documentStorageService.upload(CLIENT_ID, CATEGORY, FILE_NAME, BASE64_DATA, MIME_TYPE);

        verify(s3Client).putObject(captor.capture(), any(RequestBody.class));
        assertThat(captor.getValue().contentLength()).isEqualTo((long) FILE_BYTES.length);
    }

    /** Verifies that upload() enables AES256 server-side encryption on every request. */
    @Test
    void upload_putRequestEnablesAes256ServerSideEncryption() {
        ArgumentCaptor<PutObjectRequest> captor = ArgumentCaptor.forClass(PutObjectRequest.class);

        documentStorageService.upload(CLIENT_ID, CATEGORY, FILE_NAME, BASE64_DATA, MIME_TYPE);

        verify(s3Client).putObject(captor.capture(), any(RequestBody.class));
        assertThat(captor.getValue().serverSideEncryption()).isEqualTo(ServerSideEncryption.AES256);
    }

    /** Verifies that upload() correctly decodes base64 and passes the raw bytes to S3. */
    @Test
    void upload_decodesBase64BeforeSendingToS3() {
        ArgumentCaptor<RequestBody> bodyCaptor = ArgumentCaptor.forClass(RequestBody.class);

        documentStorageService.upload(CLIENT_ID, CATEGORY, FILE_NAME, BASE64_DATA, MIME_TYPE);

        verify(s3Client).putObject(any(PutObjectRequest.class), bodyCaptor.capture());
        // Content length on the RequestBody should match the decoded byte length
        assertThat(bodyCaptor.getValue().optionalContentLength())
            .hasValue((long) FILE_BYTES.length);
    }

    /** Verifies that upload() works correctly for PDF files with a different category. */
    @Test
    void upload_pdfAddressDocument_buildsCorrectKeyAndContentType() {
        byte[] pdfBytes   = "fake-pdf-content".getBytes();
        String pdfBase64  = Base64.getEncoder().encodeToString(pdfBytes);
        ArgumentCaptor<PutObjectRequest> captor = ArgumentCaptor.forClass(PutObjectRequest.class);

        String key = documentStorageService.upload(CLIENT_ID, "address", "bill.pdf", pdfBase64, "application/pdf");

        verify(s3Client).putObject(captor.capture(), any(RequestBody.class));
        assertThat(key).isEqualTo("clients/clt_abc123/address/bill.pdf");
        assertThat(captor.getValue().contentType()).isEqualTo("application/pdf");
    }

    /** Verifies that upload() throws IllegalArgumentException when the base64 string is invalid. */
    @Test
    void upload_invalidBase64_throwsIllegalArgumentException() {
        assertThatThrownBy(() ->
            documentStorageService.upload(CLIENT_ID, CATEGORY, FILE_NAME, "!!!not-valid-base64!!!", MIME_TYPE)
        )
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("Invalid base64 content for primary document");
    }

    /** Verifies that upload() throws IllegalArgumentException with the correct category in the message. */
    @Test
    void upload_invalidBase64ForAddressCategory_messageContainsCategory() {
        assertThatThrownBy(() ->
            documentStorageService.upload(CLIENT_ID, "address", "bill.pdf", "!!!bad!!!", "application/pdf")
        )
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("Invalid base64 content for address document");
    }

    /** Verifies that upload() does not call S3 when base64 decoding fails. */
    @Test
    void upload_invalidBase64_doesNotCallS3() {
        assertThatThrownBy(() ->
            documentStorageService.upload(CLIENT_ID, CATEGORY, FILE_NAME, "!!!bad!!!", MIME_TYPE)
        ).isInstanceOf(IllegalArgumentException.class);

        verify(s3Client, org.mockito.Mockito.never()).putObject(any(PutObjectRequest.class), any(RequestBody.class));
    }

    @Test
    void upload_withoutConfiguredBucket_throwsIllegalStateException() {
        DocumentStorageService serviceWithoutBucket = new DocumentStorageService(s3Client, "   ");

        assertThatThrownBy(() ->
            serviceWithoutBucket.upload(CLIENT_ID, CATEGORY, FILE_NAME, BASE64_DATA, MIME_TYPE)
        ).isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("VERIFICATION_DOCUMENTS_BUCKET");
    }
}
