package com.itsa.crm.transaction_service.service;

import com.itsa.crm.transaction_service.dto.CreateTransactionRequest;
import com.itsa.crm.transaction_service.dto.ImportBatchDto;
import com.itsa.crm.transaction_service.dto.ImportBatchStatus;
import com.itsa.crm.transaction_service.dto.ImportTransactionsRequest;
import com.itsa.crm.transaction_service.dto.TransactionDto;
import com.itsa.crm.transaction_service.dto.TransactionKind;
import com.itsa.crm.transaction_service.dto.TransactionStatus;
import com.itsa.crm.transaction_service.exception.ImportBatchNotFoundException;
import com.itsa.crm.transaction_service.exception.TransactionNotFoundException;
import com.itsa.crm.transaction_service.util.IdCodec;
import java.io.BufferedReader;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * In-memory transaction store with simple filtering and mock SFTP import support.
 */
@Component
public class InMemoryTransactionsStore {
	private static final String TXN_PREFIX = "txn_";
	private static final String BATCH_PREFIX = "imp_";

	private final Clock clock;
	private final Path mockSftpRoot;
	private final AtomicLong txnSeq = new AtomicLong(1L);
	private final AtomicLong batchSeq = new AtomicLong(1L);
	private final Map<Long, TxnRecord> transactions = new ConcurrentHashMap<>();
	private final Map<Long, BatchRecord> batches = new ConcurrentHashMap<>();

	public InMemoryTransactionsStore(
		Clock clock,
		@Value("${app.mock-sftp.root}") String mockSftpRoot
	) {
		this.clock = clock;
		this.mockSftpRoot = Path.of(mockSftpRoot);
	}

	/**
	 * Creates a new transaction record.
	 */
	public TransactionDto create(CreateTransactionRequest request) {
		long id = txnSeq.getAndIncrement();
		TxnRecord record = new TxnRecord(
			id,
			request.clientId(),
			request.transaction(),
			request.amount(),
			request.date(),
			request.status(),
			null,
			null
		);
		transactions.put(id, record);
		return toDto(record);
	}

	/**
	 * Retrieves a transaction by external id.
	 */
	public TransactionDto get(String transactionId) {
		long dbId = decodeTxnId(transactionId);
		TxnRecord record = transactions.get(dbId);
		if (record == null) {
			throw new TransactionNotFoundException(transactionId);
		}
		return toDto(record);
	}

	/**
	 * Deletes a transaction by external id.
	 */
	public void delete(String transactionId) {
		long dbId = decodeTxnId(transactionId);
		if (transactions.remove(dbId) == null) {
			throw new TransactionNotFoundException(transactionId);
		}
	}

	/**
	 * Lists transactions with optional filters and pagination.
	 */
	public ListResult list(
		int limit,
		int offset,
		String clientId,
		TransactionStatus status,
		TransactionKind kind,
		LocalDate fromDate,
		LocalDate toDate
	) {
		List<TxnRecord> records = new ArrayList<>(transactions.values());
		records.sort(Comparator.comparingLong(r -> r.id));

		if (clientId != null && !clientId.isBlank()) {
			String c = clientId.trim();
			records = records.stream().filter(r -> c.equals(r.clientId)).toList();
		}
		if (status != null) {
			records = records.stream().filter(r -> status == r.status).toList();
		}
		if (kind != null) {
			records = records.stream().filter(r -> kind == r.kind).toList();
		}
		if (fromDate != null) {
			records = records.stream().filter(r -> !r.date.isBefore(fromDate)).toList();
		}
		if (toDate != null) {
			records = records.stream().filter(r -> !r.date.isAfter(toDate)).toList();
		}

		long total = records.size();
		int fromIndex = Math.min(Math.max(offset, 0), records.size());
		int toIndex = Math.min(fromIndex + Math.max(1, Math.min(200, limit)), records.size());
		List<TransactionDto> page = records.subList(fromIndex, toIndex).stream().map(InMemoryTransactionsStore::toDto).toList();
		return new ListResult(page, total);
	}

	/**
	 * Imports transactions from a mock SFTP CSV file into memory.
	 */
	public ImportBatchDto importFromMockSftp(ImportTransactionsRequest request) {
		String requestedClientId = request == null ? null : request.clientId();
		String sourcePath = request == null ? null : request.sourcePath();
		Path file = resolveSource(sourcePath);

		long batchId = batchSeq.getAndIncrement();
		Instant requestedAt = clock.instant();
		BatchRecord batch = new BatchRecord(
			batchId,
			ImportBatchStatus.running,
			requestedClientId,
			requestedAt,
			requestedAt,
			null,
			0,
			0,
			0,
			null
		);
		batches.put(batchId, batch);

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
					continue; // header
				}
				total++;
				try {
					TxnRecord r = parseCsv(trimmed, batchId, requestedClientId);
					if (r == null) {
						continue; // filtered out by requestedClientId
					}
					transactions.put(r.id, r);
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

		Instant finishedAt = clock.instant();
		ImportBatchStatus status = errorMessage == null ? ImportBatchStatus.completed : ImportBatchStatus.failed;
		BatchRecord completed = new BatchRecord(
			batchId,
			status,
			requestedClientId,
			requestedAt,
			requestedAt,
			finishedAt,
			total,
			imported,
			failed,
			errorMessage
		);
		batches.put(batchId, completed);
		return toDto(completed);
	}

	/**
	 * Loads a previously created import batch by id.
	 */
	public ImportBatchDto getBatch(String importBatchId) {
		long dbId = decodeBatchId(importBatchId);
		BatchRecord record = batches.get(dbId);
		if (record == null) {
			throw new ImportBatchNotFoundException(importBatchId);
		}
		return toDto(record);
	}

	/**
	 * Resolves a provided path against the configured mock SFTP root.
	 */
	private Path resolveSource(String sourcePath) {
		if (sourcePath == null || sourcePath.isBlank()) {
			return mockSftpRoot.resolve("transactions.csv").normalize();
		}
		Path p = Path.of(sourcePath).normalize();
		if (p.isAbsolute()) {
			return p;
		}
		return mockSftpRoot.resolve(p).normalize();
	}

	/**
	 * Parses a CSV line into a transaction record, optionally filtering by client id.
	 */
	private TxnRecord parseCsv(String line, long batchId, String requestedClientId) {
		String[] parts = line.split(",");
		if (parts.length < 5) {
			throw new IllegalArgumentException("invalid csv");
		}
		String clientId = parts[0].trim();
		if (requestedClientId != null && !requestedClientId.isBlank() && !requestedClientId.equals(clientId)) {
			return null;
		}
		TransactionKind kind = TransactionKind.fromWireValue(parts[1].trim());
		BigDecimal amount = new BigDecimal(parts[2].trim());
		LocalDate date = LocalDate.parse(parts[3].trim());
		TransactionStatus status = TransactionStatus.fromWireValue(parts[4].trim());

		long id = txnSeq.getAndIncrement();
		Instant now = clock.instant();
		return new TxnRecord(
			id,
			clientId,
			kind,
			amount,
			date,
			status,
			now,
			encodeBatchId(batchId)
		);
	}

	private static TransactionDto toDto(TxnRecord r) {
		return new TransactionDto(
			encodeTxnId(r.id),
			r.clientId,
			r.kind,
			r.amount,
			r.date,
			r.status,
			r.importedAt,
			r.importBatchId
		);
	}

	private static ImportBatchDto toDto(BatchRecord r) {
		return new ImportBatchDto(
			encodeBatchId(r.id),
			r.status,
			r.requestedClientId,
			r.requestedAt,
			r.startedAt,
			r.finishedAt,
			r.totalRecords,
			r.importedRecords,
			r.failedRecords,
			r.errorMessage
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

	public record ListResult(
		List<TransactionDto> data,
		long total
	) {}

	private static final class TxnRecord {
		private final long id;
		private final String clientId;
		private final TransactionKind kind;
		private final BigDecimal amount;
		private final LocalDate date;
		private final TransactionStatus status;
		private final Instant importedAt;
		private final String importBatchId;

		private TxnRecord(
			long id,
			String clientId,
			TransactionKind kind,
			BigDecimal amount,
			LocalDate date,
			TransactionStatus status,
			Instant importedAt,
			String importBatchId
		) {
			this.id = id;
			this.clientId = clientId;
			this.kind = kind;
			this.amount = amount;
			this.date = date;
			this.status = status;
			this.importedAt = importedAt;
			this.importBatchId = importBatchId;
		}
	}

	private record BatchRecord(
		long id,
		ImportBatchStatus status,
		String requestedClientId,
		Instant requestedAt,
		Instant startedAt,
		Instant finishedAt,
		int totalRecords,
		int importedRecords,
		int failedRecords,
		String errorMessage
	) {}
}

