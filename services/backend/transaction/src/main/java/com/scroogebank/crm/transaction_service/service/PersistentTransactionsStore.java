package com.scroogebank.crm.transaction_service.service;

import com.scroogebank.crm.transaction_service.dto.CreateTransactionRequest;
import com.scroogebank.crm.transaction_service.dto.ImportBatchDto;
import com.scroogebank.crm.transaction_service.dto.ImportBatchStatus;
import com.scroogebank.crm.transaction_service.dto.ImportTransactionsRequest;
import com.scroogebank.crm.transaction_service.dto.TransactionDto;
import com.scroogebank.crm.transaction_service.dto.TransactionKind;
import com.scroogebank.crm.transaction_service.dto.TransactionStatus;
import com.scroogebank.crm.transaction_service.entity.TransactionImportBatchEntity;
import com.scroogebank.crm.transaction_service.entity.TransactionRecordEntity;
import com.scroogebank.crm.transaction_service.exception.ImportBatchNotFoundException;
import com.scroogebank.crm.transaction_service.exception.TransactionNotFoundException;
import com.scroogebank.crm.transaction_service.repository.TransactionImportBatchRepository;
import com.scroogebank.crm.transaction_service.repository.TransactionRecordRepository;
import com.scroogebank.crm.transaction_service.util.IdCodec;
import java.io.BufferedReader;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * PostgreSQL-backed transaction store for production-safe multi-replica operation.
 */
@Component
@ConditionalOnProperty(name = "app.transactions-store.type", havingValue = "postgres")
public class PersistentTransactionsStore implements TransactionsStore {
	private static final String TXN_PREFIX = "txn_";
	private static final String BATCH_PREFIX = "imp_";

	private final Clock clock;
	private final Path mockSftpRoot;
	private final TransactionRecordRepository transactionRepository;
	private final TransactionImportBatchRepository batchRepository;

	public PersistentTransactionsStore(
		Clock clock,
		@Value("${app.mock-sftp.root}") String mockSftpRoot,
		TransactionRecordRepository transactionRepository,
		TransactionImportBatchRepository batchRepository
	) {
		this.clock = clock;
		this.mockSftpRoot = Path.of(mockSftpRoot);
		this.transactionRepository = transactionRepository;
		this.batchRepository = batchRepository;
	}

	@Transactional
	@Override
	public TransactionDto create(CreateTransactionRequest request) {
		TransactionRecordEntity entity = new TransactionRecordEntity();
		entity.setClientId(request.clientId());
		entity.setKind(request.transaction());
		entity.setAmount(request.amount());
		entity.setDate(request.date());
		entity.setStatus(request.status());
		entity.setImportedAt(null);
		entity.setImportBatch(null);
		return toDto(transactionRepository.save(entity));
	}

	@Transactional
	@Override
	public TransactionDto get(String transactionId) {
		long dbId = decodeTxnId(transactionId);
		TransactionRecordEntity record = transactionRepository.findById(dbId).orElse(null);
		if (record == null) {
			throw new TransactionNotFoundException(transactionId);
		}
		return toDto(record);
	}

	@Transactional
	@Override
	public void delete(String transactionId) {
		long dbId = decodeTxnId(transactionId);
		if (!transactionRepository.existsById(dbId)) {
			throw new TransactionNotFoundException(transactionId);
		}
		transactionRepository.deleteById(dbId);
	}

	@Transactional
	@Override
	public InMemoryTransactionsStore.ListResult list(
		int limit,
		int offset,
		String clientId,
		TransactionStatus status,
		TransactionKind kind,
		LocalDate fromDate,
		LocalDate toDate
	) {
		List<TransactionRecordEntity> rows = transactionRepository.findAll(Sort.by(Sort.Direction.ASC, "id"));
		if (clientId != null && !clientId.isBlank()) {
			String normalizedClientId = clientId.trim();
			rows = rows.stream().filter(r -> normalizedClientId.equals(r.getClientId())).toList();
		}
		if (status != null) {
			rows = rows.stream().filter(r -> status == r.getStatus()).toList();
		}
		if (kind != null) {
			rows = rows.stream().filter(r -> kind == r.getKind()).toList();
		}
		if (fromDate != null) {
			rows = rows.stream().filter(r -> !r.getDate().isBefore(fromDate)).toList();
		}
		if (toDate != null) {
			rows = rows.stream().filter(r -> !r.getDate().isAfter(toDate)).toList();
		}

		long total = rows.size();
		int fromIndex = Math.min(Math.max(offset, 0), rows.size());
		int toIndex = Math.min(fromIndex + Math.max(1, Math.min(200, limit)), rows.size());
		List<TransactionDto> page = rows.subList(fromIndex, toIndex).stream()
			.map(PersistentTransactionsStore::toDto)
			.toList();
		return new InMemoryTransactionsStore.ListResult(page, total);
	}

	@Transactional
	@Override
	public ImportBatchDto importFromMockSftp(ImportTransactionsRequest request) {
		String requestedClientId = request == null ? null : request.clientId();
		String sourcePath = request == null ? null : request.sourcePath();
		Path file = resolveSource(sourcePath);

		Instant requestedAt = clock.instant();
		TransactionImportBatchEntity batch = new TransactionImportBatchEntity();
		batch.setStatus(ImportBatchStatus.running);
		batch.setRequestedClientId(requestedClientId);
		batch.setRequestedAt(requestedAt);
		batch.setStartedAt(requestedAt);
		batch.setFinishedAt(null);
		batch.setTotalRecords(0);
		batch.setImportedRecords(0);
		batch.setFailedRecords(0);
		batch.setErrorMessage(null);
		TransactionImportBatchEntity savedBatch = batchRepository.save(batch);

		int total = 0;
		int imported = 0;
		int failed = 0;
		String errorMessage = null;
		try (BufferedReader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
			String line;
			while ((line = reader.readLine()) != null) {
				String trimmed = line.trim();
				if (trimmed.isBlank()) {
					continue;
				}
				if (trimmed.toLowerCase(Locale.ROOT).startsWith("clientid,")) {
					continue;
				}
				total++;
				try {
					TransactionRecordEntity entity = parseCsv(trimmed, savedBatch, requestedClientId);
					if (entity == null) {
						continue;
					}
					transactionRepository.save(entity);
					imported++;
				}
				catch (Exception ex) {
					failed++;
				}
			}
		}
		catch (IOException ex) {
			errorMessage = "failed to read source";
		}

		savedBatch.setStatus(errorMessage == null ? ImportBatchStatus.completed : ImportBatchStatus.failed);
		savedBatch.setFinishedAt(clock.instant());
		savedBatch.setTotalRecords(total);
		savedBatch.setImportedRecords(imported);
		savedBatch.setFailedRecords(failed);
		savedBatch.setErrorMessage(errorMessage);
		return toDto(batchRepository.save(savedBatch));
	}

	@Transactional
	@Override
	public ImportBatchDto getBatch(String importBatchId) {
		long dbId = decodeBatchId(importBatchId);
		TransactionImportBatchEntity batch = batchRepository.findById(dbId).orElse(null);
		if (batch == null) {
			throw new ImportBatchNotFoundException(importBatchId);
		}
		return toDto(batch);
	}

	private Path resolveSource(String sourcePath) {
		if (sourcePath == null || sourcePath.isBlank()) {
			return mockSftpRoot.resolve("transactions.csv").normalize();
		}
		Path candidate = Path.of(sourcePath).normalize();
		if (candidate.isAbsolute()) {
			return candidate;
		}
		return mockSftpRoot.resolve(candidate).normalize();
	}

	private TransactionRecordEntity parseCsv(String line, TransactionImportBatchEntity batch, String requestedClientId) {
		String[] parts = line.split(",");
		if (parts.length < 5) {
			throw new IllegalArgumentException("invalid csv");
		}
		String clientId = parts[0].trim();
		if (requestedClientId != null && !requestedClientId.isBlank() && !requestedClientId.equals(clientId)) {
			return null;
		}

		TransactionRecordEntity entity = new TransactionRecordEntity();
		entity.setClientId(clientId);
		entity.setKind(TransactionKind.fromWireValue(parts[1].trim()));
		entity.setAmount(new BigDecimal(parts[2].trim()));
		entity.setDate(LocalDate.parse(parts[3].trim()));
		entity.setStatus(TransactionStatus.fromWireValue(parts[4].trim()));
		entity.setImportedAt(clock.instant());
		entity.setImportBatch(batch);
		return entity;
	}

	private static TransactionDto toDto(TransactionRecordEntity entity) {
		return new TransactionDto(
			encodeTxnId(entity.getId()),
			entity.getClientId(),
			entity.getKind(),
			entity.getAmount(),
			entity.getDate(),
			entity.getStatus(),
			entity.getImportedAt(),
			entity.getImportBatch() == null ? null : encodeBatchId(entity.getImportBatch().getId())
		);
	}

	private static ImportBatchDto toDto(TransactionImportBatchEntity entity) {
		return new ImportBatchDto(
			encodeBatchId(entity.getId()),
			entity.getStatus(),
			entity.getRequestedClientId(),
			entity.getRequestedAt(),
			entity.getStartedAt(),
			entity.getFinishedAt(),
			entity.getTotalRecords(),
			entity.getImportedRecords(),
			entity.getFailedRecords(),
			entity.getErrorMessage()
		);
	}

	private static long decodeTxnId(String txnId) {
		return IdCodec.decode(TXN_PREFIX, txnId);
	}

	private static String encodeTxnId(long dbId) {
		return IdCodec.encode(TXN_PREFIX, dbId);
	}

	private static long decodeBatchId(String batchId) {
		return IdCodec.decode(BATCH_PREFIX, batchId);
	}

	private static String encodeBatchId(long dbId) {
		return IdCodec.encode(BATCH_PREFIX, dbId);
	}
}
