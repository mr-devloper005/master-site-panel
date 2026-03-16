import { useMemo, useState } from "react";
import toast from "react-hot-toast";

import Modal from "../common/Modal";

const codeBlockClass =
  "max-h-72 overflow-auto rounded-xl border border-[var(--border-color)] bg-slate-950 p-3 text-xs text-slate-100";

export default function SiteProvisioningModal({ open, onClose, packageData }) {
  const [copied, setCopied] = useState("");

  const details = useMemo(() => {
    if (!packageData) return null;

    if (packageData.type === "site") {
      return {
        heading: "Site master key ready",
        token: packageData.provisioning?.siteMasterKey?.rawApiKey || "",
        apiTitle: "Recommended APIs",
        api: [
          "/api/v1/sites/:siteId/tasks",
          "/:siteCode/post/v1/:task",
        ],
        payload: null,
        curl: null,
        usage: packageData.provisioning?.usage || [],
      };
    }

    return {
      heading: `${packageData.task?.label || packageData.task?.task || "Task"} package ready`,
      token: packageData.task?.token || "",
      apiTitle: "API endpoint",
      api: packageData.task?.endpoint
        ? [packageData.task.endpoint, packageData.task.legacyEndpoint].filter(Boolean)
        : [],
      payload: packageData.task?.payload || null,
      curl: packageData.task?.curlExample || null,
      usage: packageData.task?.usage || [],
    };
  }, [packageData]);

  const handleCopy = async (value, label) => {
    if (!value) return;
    await navigator.clipboard.writeText(typeof value === "string" ? value : JSON.stringify(value, null, 2));
    setCopied(label);
    toast.success(`${label} copied`);
  };

  if (!details) return null;

  return (
    <Modal title={details.heading} open={open} onClose={onClose} width="max-w-4xl">
      <div className="space-y-4">
        <div className="rounded-2xl border border-[var(--border-color)] bg-slate-50 p-4 dark:bg-slate-900/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                Token
              </p>
              <p className="mt-1 break-all font-mono text-sm">{details.token || "Not available"}</p>
            </div>
            <button
              type="button"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white"
              onClick={() => handleCopy(details.token, "Token")}
            >
              {copied === "Token" ? "Copied" : "Copy token"}
            </button>
          </div>
        </div>

        {details.api?.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">{details.apiTitle || "API endpoint"}</h3>
              {details.api[0] ? (
                <button
                  type="button"
                  className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-sm"
                  onClick={() => handleCopy(details.api[0], "API endpoint")}
                >
                  Copy endpoint
                </button>
              ) : null}
            </div>
            <pre className={codeBlockClass}>{details.api.join("\n")}</pre>
          </section>
        )}

        {details.payload ? (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">Payload template</h3>
              <button
                type="button"
                className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-sm"
                onClick={() => handleCopy(details.payload, "Payload")}
              >
                Copy payload
              </button>
            </div>
            <pre className={codeBlockClass}>{JSON.stringify(details.payload, null, 2)}</pre>
          </section>
        ) : null}

        {details.curl ? (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">Usage example</h3>
              <button
                type="button"
                className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-sm"
                onClick={() => handleCopy(details.curl, "cURL example")}
              >
                Copy cURL
              </button>
            </div>
            <pre className={codeBlockClass}>{details.curl}</pre>
          </section>
        ) : null}

        {details.usage?.length > 0 ? (
          <section className="space-y-2">
            <h3 className="font-semibold">Usage guidance</h3>
            <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
              {details.usage.map((item) => (
                <li key={item} className="rounded-xl border border-[var(--border-color)] px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Modal>
  );
}
