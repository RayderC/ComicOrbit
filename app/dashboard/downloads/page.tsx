import DownloadProgress from "../../components/DownloadProgress";

export default function DashboardDownloads() {
  return (
    <>
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Downloads</h1>
          <p className="dash-subtitle">Live queue. Progress updates over SSE.</p>
        </div>
      </div>

      <DownloadProgress />
    </>
  );
}
