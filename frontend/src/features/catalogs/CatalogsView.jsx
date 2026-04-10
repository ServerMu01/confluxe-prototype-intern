import { useEffect, useMemo, useRef, useState } from 'react';
import { Database, FileJson, Loader2, RefreshCw, Trash2, UploadCloud, XCircle } from 'lucide-react';
import { cancelCatalogJob, deleteCatalogJob, getCatalogJobStatus, listCatalogJobs, uploadCatalog } from '@/lib/api';

const STATUS_STYLE = {
  uploading: {
    color: 'text-[#1D5E9E]',
    bg: 'bg-[#1D5E9E]/10',
    border: 'border-[#1D5E9E]/20',
    label: 'Uploading'
  },
  completed: {
    color: 'text-[#2A6B3D]',
    bg: 'bg-[#2A6B3D]/10',
    border: 'border-[#2A6B3D]/20',
    label: 'Completed'
  },
  processing: {
    color: 'text-[#111111]',
    bg: 'bg-[#111111]/10',
    border: 'border-[#111111]/20',
    label: 'Processing'
  },
  queued: {
    color: 'text-[#8C827A]',
    bg: 'bg-[#8C827A]/10',
    border: 'border-[#8C827A]/20',
    label: 'Queued'
  },
  failed: {
    color: 'text-[#E32929]',
    bg: 'bg-[#E32929]/10',
    border: 'border-[#E32929]/20',
    label: 'Failed'
  },
  cancelled: {
    color: 'text-[#9A5B00]',
    bg: 'bg-[#9A5B00]/10',
    border: 'border-[#9A5B00]/20',
    label: 'Cancelled'
  }
};

function resolveStatusMeta(status) {
  const key = String(status || '').toLowerCase();
  return STATUS_STYLE[key] || STATUS_STYLE.queued;
}

function buildAgentLog(job) {
  const status = String(job.status || '').toLowerCase();
  const totalRows = toCount(job.total_rows);
  const processedRows = toCount(job.processed_rows);

  if (status === 'uploading') {
    return 'Uploading file to server and creating parsing job...';
  }
  if (status === 'completed') {
    return `Normalization completed (${processedRows}/${totalRows} rows)`;
  }
  if (status === 'processing') {
    if (totalRows === 0) {
      return 'Parsing started. Reading uploaded file and detecting row count...';
    }
    return `Parsing rows ${processedRows}/${totalRows}...`;
  }
  if (status === 'failed') {
    return job.error_message || 'Normalization failed. Check CSV columns and retry.';
  }
  if (status === 'cancelled') {
    return job.error_message || 'Parsing cancelled by user.';
  }
  return 'Queued. Waiting for parser worker to start...';
}

function canCancelJob(status) {
  const value = String(status || '').toLowerCase();
  return value === 'queued' || value === 'processing';
}

function isRunningStatus(status) {
  const value = String(status || '').toLowerCase();
  return value === 'uploading' || value === 'queued' || value === 'processing';
}

function toCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.floor(parsed);
}

function getProgressPercent(job) {
  const status = String(job?.status || '').toLowerCase();
  if (status === 'uploading') {
    return 8;
  }

  const totalRows = toCount(job?.total_rows);
  const processedRows = toCount(job?.processed_rows);

  if (totalRows <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((processedRows / totalRows) * 100)));
}

function formatProgressRows(job) {
  const status = String(job?.status || '').toLowerCase();
  if (status === 'uploading') {
    return 'Uploading file...';
  }

  const totalRows = toCount(job?.total_rows);
  const processedRows = toCount(job?.processed_rows);

  if (totalRows <= 0) {
    if (processedRows > 0) {
      return `${processedRows.toLocaleString('en-IN')} processed`;
    }
    return 'Preparing...';
  }

  return `${processedRows.toLocaleString('en-IN')} / ${totalRows.toLocaleString('en-IN')} rows`;
}

function sortJobsByCreatedAt(items) {
  return [...items].sort((left, right) => {
    const leftTime = new Date(left?.created_at || 0).getTime();
    const rightTime = new Date(right?.created_at || 0).getTime();
    return rightTime - leftTime;
  });
}

function mergeJobIntoList(existingJobs, incomingJob) {
  const index = existingJobs.findIndex((job) => job.job_id === incomingJob.job_id);
  if (index === -1) {
    return sortJobsByCreatedAt([incomingJob, ...existingJobs]);
  }

  const merged = [...existingJobs];
  merged[index] = { ...merged[index], ...incomingJob };
  return sortJobsByCreatedAt(merged);
}

export default function CatalogsView() {
  const fileInputRef = useRef(null);
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [cancelingJobId, setCancelingJobId] = useState('');
  const [deletingJobId, setDeletingJobId] = useState('');
  const [deleteDialogJob, setDeleteDialogJob] = useState(null);
  const [trackingJobId, setTrackingJobId] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [error, setError] = useState('');
  const [uploadNotice, setUploadNotice] = useState('');

  const hasRunningJobs = useMemo(
    () => jobs.some((job) => isRunningStatus(job.status)),
    [jobs]
  );

  const latestJob = jobs[0] || null;
  const latestProgressPercent = latestJob ? getProgressPercent(latestJob) : 0;
  const latestStatusMeta = resolveStatusMeta(latestJob?.status);
  const latestRowsText = latestJob ? formatProgressRows(latestJob) : 'No active rows';
  const lastSyncedLabel = lastSyncedAt
    ? lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '--';

  useEffect(() => {
    let active = true;

    async function loadJobs() {
      try {
        if (active) {
          setError('');
        }
        const data = await listCatalogJobs(30);
        if (active) {
          setJobs(sortJobsByCreatedAt(data));
          setLastSyncedAt(new Date());
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message || 'Unable to load catalog jobs.');
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    loadJobs();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hasRunningJobs) {
      return undefined;
    }

    const intervalId = window.setInterval(async () => {
      try {
        const data = await listCatalogJobs(30);
        setJobs(sortJobsByCreatedAt(data));
        setLastSyncedAt(new Date());
      } catch {
        // Keep UI responsive while transient polling errors resolve.
      }
    }, 1200);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [hasRunningJobs]);

  useEffect(() => {
    if (!trackingJobId) {
      return undefined;
    }

    let active = true;

    const fetchTrackedJob = async () => {
      try {
        const status = await getCatalogJobStatus(trackingJobId);
        if (!active) {
          return;
        }

        setJobs((existingJobs) => mergeJobIntoList(existingJobs, status));
        setLastSyncedAt(new Date());

        if (!isRunningStatus(status.status)) {
          setTrackingJobId('');
        }
      } catch {
        // Ignore transient status fetch errors during polling.
      }
    };

    fetchTrackedJob();
    const intervalId = window.setInterval(fetchTrackedJob, 900);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [trackingJobId]);

  useEffect(() => {
    if (!deleteDialogJob) {
      return undefined;
    }

    function handleEscape(event) {
      if (event.key === 'Escape' && !deletingJobId) {
        setDeleteDialogJob(null);
      }
    }

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [deleteDialogJob, deletingJobId]);

  const refreshJobs = async (showLoading = true) => {
    if (showLoading) {
      setIsLoading(true);
    }
    setError('');

    try {
      const data = await listCatalogJobs(30);
      setJobs(sortJobsByCreatedAt(data));
      setLastSyncedAt(new Date());
    } catch (loadError) {
      setError(loadError.message || 'Unable to refresh catalog jobs.');
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  };

  const handleUpload = async (file) => {
    if (!file) {
      return;
    }

    const localUploadJobId = `local_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const localUploadJob = {
      job_id: localUploadJobId,
      filename: file.name,
      status: 'uploading',
      total_rows: 0,
      processed_rows: 0,
      error_message: null,
      created_at: new Date().toISOString()
    };

    setJobs((existingJobs) => mergeJobIntoList(existingJobs, localUploadJob));
    setLastSyncedAt(new Date());

    setIsUploading(true);
    setError('');
    setUploadNotice('Uploading file and creating parsing job...');

    try {
      const result = await uploadCatalog(file);

      const optimisticJob = {
        job_id: result.job_id,
        filename: file.name,
        status: String(result.status || 'queued'),
        total_rows: 0,
        processed_rows: 0,
        error_message: null,
        created_at: new Date().toISOString()
      };

      setJobs((existingJobs) => {
        const withoutLocalUpload = existingJobs.filter((job) => job.job_id !== localUploadJobId);
        return mergeJobIntoList(withoutLocalUpload, optimisticJob);
      });
      setLastSyncedAt(new Date());
      setTrackingJobId(result.job_id);

      setUploadNotice(`Upload complete. Job ${result.job_id} is now processing in background.`);
      void refreshJobs(false);
    } catch (uploadError) {
      const message = uploadError.message || 'Catalog upload failed.';
      setJobs((existingJobs) =>
        existingJobs.map((job) =>
          job.job_id === localUploadJobId
            ? {
                ...job,
                status: 'failed',
                error_message: message
              }
            : job
        )
      );
      setLastSyncedAt(new Date());
      setError(uploadError.message || 'Catalog upload failed.');
      setUploadNotice('');
    } finally {
      setIsUploading(false);
    }
  };

  const onFileSelection = async (event) => {
    const file = event.target.files?.[0];
    if (file) {
      await handleUpload(file);
    }
    event.target.value = '';
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const onCancelJob = async (jobId) => {
    if (!jobId || cancelingJobId || deletingJobId === jobId) {
      return;
    }

    setCancelingJobId(jobId);
    setError('');

    try {
      const result = await cancelCatalogJob(jobId);
      setUploadNotice(`Job ${result.job_id} cancelled.`);
      setJobs((existingJobs) => mergeJobIntoList(existingJobs, result));
      if (trackingJobId === jobId) {
        setTrackingJobId('');
      }
      await refreshJobs(false);
    } catch (cancelError) {
      setError(cancelError.message || 'Unable to cancel this parsing job.');
    } finally {
      setCancelingJobId('');
    }
  };

  const onDeleteJob = (job) => {
    if (!job || !job.job_id || deletingJobId || cancelingJobId === job.job_id) {
      return;
    }

    setDeleteDialogJob(job);
    setError('');
  };

  const confirmDeleteJob = async () => {
    if (!deleteDialogJob || !deleteDialogJob.job_id || deletingJobId || cancelingJobId === deleteDialogJob.job_id) {
      return;
    }

    const job = deleteDialogJob;
    setDeleteDialogJob(null);
    setDeletingJobId(job.job_id);
    setError('');

    try {
      if (String(job.job_id).startsWith('local_')) {
        setJobs((existingJobs) => existingJobs.filter((existingJob) => existingJob.job_id !== job.job_id));
        setUploadNotice(`Removed local upload placeholder for ${job.filename}.`);
        return;
      }

      const result = await deleteCatalogJob(job.job_id);
      setJobs((existingJobs) => existingJobs.filter((existingJob) => existingJob.job_id !== job.job_id));
      setUploadNotice(`Job ${result.job_id} deleted.`);

      if (trackingJobId === job.job_id) {
        setTrackingJobId('');
      }

      await refreshJobs(false);
    } catch (deleteError) {
      const message = deleteError?.message || 'Unable to delete this catalog job.';
      if (message.toLowerCase().includes('was not found')) {
        setJobs((existingJobs) => existingJobs.filter((existingJob) => existingJob.job_id !== job.job_id));
        setUploadNotice(`Job ${job.job_id} is already removed.`);
      } else {
        setError(message);
      }
    } finally {
      setDeletingJobId('');
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] screen-enter">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={onFileSelection}
      />

      <div className="fade-up mb-6 md:mb-10">
        <div className="mb-2 flex items-center gap-3">
          <div className="h-1.5 w-1.5 bg-[#111111]" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#555555]">Data Operations</span>
        </div>
        <h1 className="text-2xl font-serif tracking-tight text-[#111111] md:text-3xl">
          Vendor Catalog Management.
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[#888888]">
          Upload raw vendor data files. The <strong className="text-[#111111]">Normalization Agent</strong> parses messy
          strings, maps categories, and standardizes data to the Confluxe schema.
        </p>
      </div>

      <div className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-3 md:gap-8">
        <div
          role="button"
          tabIndex={0}
          onClick={openFilePicker}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openFilePicker();
            }
          }}
          className="fade-up delay-1 col-span-1 flex cursor-pointer flex-col items-center justify-center border-2 border-dashed border-[#DCD6CA] bg-white p-8 text-center shadow-sm transition-all hover:border-[#111111] hover:bg-[#FDFCF9] md:p-12 lg:col-span-2"
        >
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F2F0EA] text-[#555555]">
            {isUploading ? <Loader2 size={24} className="animate-spin" /> : <UploadCloud size={24} />}
          </div>
          <p className="mb-1 text-lg font-serif text-[#111111]">Upload vendor catalog CSV</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#888888]">
            Semantic Parsing via LangChain Structured Output
          </p>
          <p className="mt-3 text-xs text-[#555555]">
            {isUploading ? 'Processing upload...' : 'Click to choose a CSV file'}
          </p>
        </div>

        <div className="fade-up delay-2 relative col-span-1 overflow-hidden border border-[#333] bg-[#1C1A1A] p-6 text-white shadow-sm">
          <div className="absolute left-0 top-0 h-1 w-full bg-[#2A6B3D]" />
          <div className="mb-6 flex items-center gap-2">
            <Database size={14} className="text-[#2A6B3D]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#2A6B3D]">Normalization Agent</span>
          </div>

          <div className="space-y-4 font-mono text-xs">
            <div className="flex flex-col gap-1 border-b border-[#333] pb-3">
              <span className="text-[#888]">LATEST FILE:</span>
              <span className="truncate text-white">{latestJob?.filename || 'No uploads yet'}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 border-b border-[#333] pb-3">
              <div className="flex flex-col gap-1">
                <span className="text-[#888]">STATUS:</span>
                <span className={latestStatusMeta.color}>{latestStatusMeta.label}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[#888]">ROWS:</span>
                <span className="text-white">{latestRowsText}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1 border-b border-[#333] pb-3">
              <span className="text-[#888]">PIPELINE LOG:</span>
              <span className="text-[#2A6B3D]">↳ {latestJob ? buildAgentLog(latestJob) : 'Awaiting new data...'}</span>
            </div>
            <div className="space-y-1 border-b border-[#333] pb-3">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-[#888]">PROGRESS</span>
                <span className="text-white">{latestProgressPercent}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded bg-[#3A3838]">
                <div
                  className="h-full bg-[#2A6B3D] transition-all duration-300"
                  style={{ width: latestProgressPercent > 0 ? `${latestProgressPercent}%` : isRunningStatus(latestJob?.status) ? '8%' : '0%' }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-[#888]">
              <span>LAST SYNC</span>
              <span>{lastSyncedLabel}</span>
            </div>
            <div className="mt-4 flex items-center gap-2 animate-pulse text-[#2A6B3D]">
              <div className="h-1.5 w-1.5 rounded-full bg-[#2A6B3D]" />
              {hasRunningJobs ? 'Agent processing active...' : 'Agent idle'}
            </div>
          </div>
        </div>
      </div>

      {uploadNotice && (
        <div className="confluxe-alert confluxe-alert-success mb-4">
          {uploadNotice}
        </div>
      )}

      {error && (
        <div className="confluxe-alert confluxe-alert-error mb-4">
          {error}
        </div>
      )}

      <div className="fade-up delay-3 w-full border border-[#E5E2D9] bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-4 border-b border-[#E5E2D9] p-4 sm:flex-row sm:items-center md:p-5">
          <h2 className="font-serif text-[#111111]">Connected Catalogs</h2>
          <button
            type="button"
            onClick={refreshJobs}
            className="flex w-full items-center justify-center gap-2 border border-[#E5E2D9] bg-[#F2F0EA] py-2 text-[10px] font-bold uppercase tracking-widest text-[#555555] hover:text-[#111111] sm:w-auto sm:border-transparent sm:bg-transparent sm:py-0"
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
            Sync All
          </button>
        </div>

        {!isLoading && jobs.length === 0 && (
          <div className="p-6 text-center text-sm text-[#888888]">
            No catalog jobs yet. Upload a CSV to start normalization.
          </div>
        )}

        <div className="space-y-3 p-4 md:hidden">
          {jobs.map((cat, index) => {
            const statusMeta = resolveStatusMeta(cat.status);

            return (
            <div
              key={cat.job_id}
              className="stagger-item border border-[#E5E2D9] bg-white p-4"
              style={{ animationDelay: `${140 + index * 70}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-serif text-[#111111]">{cat.filename}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-[#888888]">
                    {formatProgressRows(cat)}
                  </p>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center justify-center border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${statusMeta.color} ${statusMeta.bg} ${statusMeta.border}`}
                >
                  {statusMeta.label}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-[#EFECE4]">
                <div
                  className="h-full bg-[#2A6B3D] transition-all duration-300"
                  style={{ width: getProgressPercent(cat) > 0 ? `${getProgressPercent(cat)}%` : isRunningStatus(cat.status) ? '8%' : '0%' }}
                />
              </div>
              <p className="mt-3 border-l-2 border-[#E5E2D9] bg-[#FAF9F5] px-3 py-2 font-mono text-[11px] text-[#555555]">
                {'>'} {buildAgentLog(cat)}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {canCancelJob(cat.status) && (
                  <button
                    type="button"
                    onClick={() => onCancelJob(cat.job_id)}
                    disabled={cancelingJobId === cat.job_id || deletingJobId === cat.job_id}
                    className="inline-flex items-center gap-2 border border-[#E5CFCF] bg-[#FFF6F6] px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[#B01C1C] transition hover:bg-[#FFECEC] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {cancelingJobId === cat.job_id ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                    Cancel Parsing
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onDeleteJob(cat)}
                  disabled={deletingJobId === cat.job_id || cancelingJobId === cat.job_id}
                  className="inline-flex items-center gap-2 border border-[#D8D3C7] bg-[#F8F6F0] px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[#555555] transition hover:border-[#B9B19D] hover:text-[#111111] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deletingJobId === cat.job_id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  Delete
                </button>
              </div>
            </div>
          );
          })}
        </div>

        <div className="hidden w-full overflow-x-auto md:block">
          <table className="min-w-[600px] w-full whitespace-nowrap text-left text-sm">
            <thead className="border-b border-[#E5E2D9] bg-[#FAF9F5] text-[#888888]">
              <tr>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider">File Name</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider">Rows</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider">Progress</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider">Agent Activity Log</th>
                <th className="px-6 py-4 text-right text-[10px] font-bold uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-right text-[10px] font-bold uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E2D9]">
              {jobs.map((cat) => {
                const statusMeta = resolveStatusMeta(cat.status);

                return (
                <tr key={cat.job_id} className="transition-colors hover:bg-[#FDFCF9]">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <FileJson size={16} className="text-[#888888]" />
                      <span className="font-serif text-[#111111]">{cat.filename}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 font-serif text-[#111111]">{formatProgressRows(cat)}</td>
                  <td className="px-6 py-5">
                    <div className="flex min-w-[130px] items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded bg-[#EFECE4]">
                        <div
                          className="h-full bg-[#2A6B3D] transition-all duration-300"
                          style={{ width: getProgressPercent(cat) > 0 ? `${getProgressPercent(cat)}%` : isRunningStatus(cat.status) ? '8%' : '0%' }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-[#555555]">{getProgressPercent(cat)}%</span>
                    </div>
                  </td>
                  <td className="w-1/3 bg-[#FAF9F5] px-6 py-5 font-mono text-xs text-[#555555]">
                    {'>'} {buildAgentLog(cat)}
                  </td>
                  <td className="px-6 py-5 text-right">
                    <span
                      className={`inline-flex items-center justify-center border px-3 py-1 text-[9px] font-bold uppercase tracking-widest ${statusMeta.color} ${statusMeta.bg} ${statusMeta.border}`}
                    >
                      {statusMeta.label}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="inline-flex items-center gap-2">
                      {canCancelJob(cat.status) && (
                        <button
                          type="button"
                          onClick={() => onCancelJob(cat.job_id)}
                          disabled={cancelingJobId === cat.job_id || deletingJobId === cat.job_id}
                          className="inline-flex items-center gap-2 border border-[#E5CFCF] bg-[#FFF6F6] px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-[#B01C1C] transition hover:bg-[#FFECEC] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {cancelingJobId === cat.job_id ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}
                          Cancel
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onDeleteJob(cat)}
                        disabled={deletingJobId === cat.job_id || cancelingJobId === cat.job_id}
                        className="inline-flex items-center gap-2 border border-[#D8D3C7] bg-[#F8F6F0] px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-[#555555] transition hover:border-[#B9B19D] hover:text-[#111111] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingJobId === cat.job_id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {deleteDialogJob && (
        <div
          className="confluxe-modal-backdrop flex items-center justify-center p-4"
          onClick={() => {
            if (!deletingJobId) {
              setDeleteDialogJob(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Delete catalog confirmation"
            className="confluxe-modal w-full max-w-md p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#B01C1C]">
              Delete Catalog
            </div>
            <h3 className="font-serif text-lg text-[#111111]">Remove this connected catalog?</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#555555]">
              <span className="font-semibold text-[#111111]">{deleteDialogJob.filename}</span> and all generated
              intelligence records for this job will be removed.
            </p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteDialogJob(null)}
                disabled={Boolean(deletingJobId)}
                className="inline-flex items-center border border-[#D8D3C7] bg-[#F8F6F0] px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[#555555] transition hover:border-[#B9B19D] hover:text-[#111111] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={confirmDeleteJob}
                disabled={Boolean(deletingJobId)}
                className="inline-flex items-center gap-2 border border-[#E5CFCF] bg-[#FFF6F6] px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[#B01C1C] transition hover:bg-[#FFECEC] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingJobId ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
