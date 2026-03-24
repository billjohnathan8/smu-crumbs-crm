package com.scroogebank.crm.transaction_service.service;

import com.scroogebank.crm.transaction_service.dto.CreateTransactionRequest;
import com.scroogebank.crm.transaction_service.dto.ImportBatchDto;
import com.scroogebank.crm.transaction_service.dto.ImportBatchStatus;
import com.scroogebank.crm.transaction_service.dto.ImportTransactionsRequest;
import com.scroogebank.crm.transaction_service.dto.TransactionDto;
import com.scroogebank.crm.transaction_service.dto.TransactionKind;
import com.scroogebank.crm.transaction_service.dto.TransactionStatus;
import com.scroogebank.crm.transaction_service.exception.ImportBatchNotFoundException;
import com.scroogebank.crm.transaction_service.exception.TransactionNotFoundException;
import com.scroogebank.crm.transaction_service.service.imports.TransactionFileSource;
import com.scroogebank.crm.transaction_service.service.imports.TransactionCsvParser;
import com.scroogebank.crm.transaction_service.service.imports.TransactionCsvParser.ParseResult;
import com.scroogebank.crm.transaction_service.service.imports.TransactionCsvParser.ParsedTransactionRow;
import com.scroogebank.crm.transaction_service.util.IdCodec;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * In-memory transaction store with simple filtering and S3-backed mock import support.
 *
 * <p>This store is process-local and not shared across replicas. Transaction/import records are lost on
 * task restart and are invisible to other tasks. When this store is selected, keep the service
 * single-replica in production.
 */
@Component
@ConditionalOnProperty(name = "app.transactions-store.type", havingValue = "in-memory")
public class InMemoryTransactionsStore implements TransactionsStore {
	private static final String TXN_PREFIX = "txn_";
	private static final String BATCH_PREFIX = "imp_";
	private static final String DEFAULT_SOURCE_PATH = "transactions.csv";
	private static final Logger logger = LoggerFactory.getLogger(InMemoryTransactionsStore.class);

	private final Clock clock;
	private final TransactionFileSource fileSource;
	private final TransactionCsvParser csvParser;
	private final AtomicLong txnSeq = new AtomicLong(1L);
	private final AtomicLong batchSeq = new AtomicLong(1L);
	private final Map<Long, TxnRecord> transactions = new ConcurrentHashMap<>();
	private final Map<Long, BatchRecord> batches = new ConcurrentHashMap<>();
	private final Map<String, Long> importedDedupeKeys = new ConcurrentHashMap<>();

	public InMemoryTransactionsStore(
		Clock clock,
		TransactionFileSource fileSource,
		TransactionCsvParser csvParser
	) {
		this.clock = clock;
		this.fileSource = fileSource;
		this.csvParser = csvParser;
	}

	/**
	 * Creates a new transaction record.
	 */
	@Override
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
	@Override
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
	@Override
	public void delete(String transactionId) {
		long dbId = decodeTxnId(transactionId);
		if (transactions.remove(dbId) == null) {
			throw new TransactionNotFoundException(transactionId);
		}
	}

	/**
	 * Lists transactions with optional filters and pagination.
	 */
	@Override
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
	 * Imports transactions from a CSV source (S3 bucket or local filesystem) into memory.
	 */
	@Override
	public ImportBatchDto importTransactions(ImportTransactionsRequest request) {
		String requestedClientId = request == null ? null : request.clientId();
		String sourcePath = request == null ? DEFAULT_SOURCE_PATH : normalizeSourcePath(request.sourcePath());

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
		try (var reader = fileSource.openCsvFile(sourcePath)) {
			ParseResult parseResult = csvParser.parse(reader, requestedClientId);
			total = parseResult.totalRecords();
			failed = parseResult.failedRecords();

			for (ParsedTransactionRow row : parseResult.rows()) {
				if (importedDedupeKeys.containsKey(row.dedupeKey())) {
					continue;
				}
				try {
					long id = txnSeq.getAndIncrement();
					Instant now = clock.instant();
					TxnRecord record = new TxnRecord(
						id,
						row.clientId(),
						row.kind(),
						row.amount(),
						row.date(),
						row.status(),
						now,
						encodeBatchId(batchId)
					);
					transactions.put(id, record);
					importedDedupeKeys.put(row.dedupeKey(), id);
					imported++;
				}
				catch (Exception ex) {
					failed++;
					logger.warn("Failed to import a parsed transaction row from '{}'", sourcePath, ex);
				}
			}
		}
		catch (IOException ex) {
			errorMessage = "failed to read source";
			logger.warn("Failed to read transaction source '{}': {}", sourcePath, ex.getMessage());
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
	@Override
	public ImportBatchDto getBatch(String importBatchId) {
		long dbId = decodeBatchId(importBatchId);
		BatchRecord record = batches.get(dbId);
		if (record == null) {
			throw new ImportBatchNotFoundException(importBatchId);
		}
		return toDto(record);
	}

	private static String normalizeSourcePath(String sourcePath) {
		if (sourcePath == null || sourcePath.isBlank()) {
			return DEFAULT_SOURCE_PATH;
		}
		return sourcePath.trim();
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

