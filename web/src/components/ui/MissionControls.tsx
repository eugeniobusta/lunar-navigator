// Where and when: the landing site, the date and the length of the stay. Shared by the pages that use one site.
import { SiteSelect } from ".";
import { fmtDate, idxToMs } from "../../state/derived";
import { useStore } from "../../state/store";

export function MissionControls({ length = true }: { length?: boolean }) {
  const st = useStore();
  const eph = st.eph;
  if (!eph) return null;
  const minDate = fmtDate(eph.startMs, false), maxDate = fmtDate(idxToMs(eph.n - 1), false);
  return (
    <div className="mission-bar controls" aria-label="Mission">
      <SiteSelect label="Landing site" sites={st.sites} value={st.siteId} onChange={st.setSite} />
      <label className="field">
        <span>Landing date (UTC)</span>
        <input type="date" value={fmtDate(idxToMs(st.startIdx), false)} min={minDate} max={maxDate}
          onChange={(e) => { const ms = Date.parse(e.target.value + "T00:00:00Z"); if (!Number.isNaN(ms)) st.setStartIdx((ms - eph.startMs) / (eph.stepS * 1000)); }} />
      </label>
      {length && (
        <label className="field">
          <span>Mission length</span>
          <select value={st.windowDays} onChange={(e) => st.setWindowDays(+e.target.value)}>
            {[...new Set([1, 3, 7, 14, 30, 90, 365, st.windowDays])].sort((a, b) => a - b).map((d) => <option key={d} value={d}>{d === 1 ? "1 day" : `${d} days`}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
