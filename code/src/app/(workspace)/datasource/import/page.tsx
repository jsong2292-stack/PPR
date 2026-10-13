import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { ImportWizard } from '@/components/datasource/ImportWizard';
import { requirePermission } from '@/lib/auth/session';
import { query, type RowDataPacket } from '@/lib/db';
import { config } from '@/lib/config';
import { fmtCount } from '@/lib/format';

export const metadata: Metadata = { title: 'Excel 批量导入' };
export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  validating: '校验中',
  validated: '校验通过',
  committed: '已写入',
  failed: '校验失败',
  cancelled: '已取消',
};

const STATUS_TONES: Record<string, string> = {
  validating: '',
  validated: 'u-tag--info',
  committed: 'u-tag--normal',
  failed: 'u-tag--high',
  cancelled: '',
};

/**
 * Excel 批量导入。
 *
 * 页面本身不解析文件：上传后由 /api/datasource/import 在服务端逐行校验，
 * 校验结果先落 import_job，再决定是否整批写入业务表。
 * 页面右下方的「最近导入任务」直接读库，便于核对每一批的历史结论。
 */
export default async function DatasourceImportPage() {
  await requirePermission('datasource:read');
  await requirePermission('datasource:import');

  const jobs = await query<RowDataPacket>(
    `SELECT id, code, group_key AS groupKey, file_name AS fileName, file_size_bytes AS fileSizeBytes,
            total_rows AS totalRows, success_rows AS successRows, error_rows AS errorRows,
            status, created_at AS createdAt, committed_at AS committedAt, remark
       FROM import_job
      ORDER BY id DESC
      LIMIT 10`,
  );

  return (
    <>
      <PageHeader
        title="Excel 批量导入"
        description="下载数据模板、上传校验并按类别整批写入。服务端先逐行校验（必填列、编码是否存在、数值与时间格式、重复行），校验不通过不写入任何数据。"
        meta={
          <>
            <span className="u-tag u-tag--info">单文件上限 {config.upload.maxMb} MB</span>
            <span className="u-tag">支持 .xlsx / .xls</span>
            <span className="u-tag">任一行有错即整批拒绝</span>
          </>
        }
        actions={
          <>
            <Link className="u-btn" href="/datasource/batches">
              查看批次数据
            </Link>
            <Link className="u-btn" href="/monitor">
              质量监控
            </Link>
          </>
        }
      />

      <ImportWizard />

      <section className="p-panel u-mt">
        <div className="p-panel__head">
          <h2>最近导入任务</h2>
          <span className="u-xs u-faint">
            校验结果先落 import_job；只有状态为「已写入」的任务才改动过业务表
          </span>
        </div>
        <div className="u-table-wrap">
          <table className="u-table">
            <thead>
              <tr>
                <th>导入批次号</th>
                <th>数据类别</th>
                <th>文件名</th>
                <th>总行数</th>
                <th>通过</th>
                <th>错误</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>写入时间</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length ? (
                jobs.map((job) => (
                  <tr key={String(job.id)}>
                    <td className="u-num">{String(job.code)}</td>
                    <td>{String(job.remark ?? job.groupKey ?? '')}</td>
                    <td>{String(job.fileName ?? '')}</td>
                    <td className="u-num">{fmtCount(job.totalRows)}</td>
                    <td className="u-num">{fmtCount(job.successRows)}</td>
                    <td className="u-num">{fmtCount(job.errorRows)}</td>
                    <td>
                      <span className={`u-tag ${STATUS_TONES[String(job.status)] ?? ''}`.trim()}>
                        {STATUS_LABELS[String(job.status)] ?? String(job.status)}
                      </span>
                    </td>
                    <td className="u-num">{String(job.createdAt ?? '')}</td>
                    <td className="u-num">{String(job.committedAt ?? '无数据')}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9}>
                    <div className="u-empty">还没有导入任务。请先在右上角下载模板并按模板填写数据。</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="p-panel__body">
          <p className="u-xs u-faint">
            导入类别与工作表一一对应：生产批次 / 产品数据 / 设备采集数据 / 样管抽检记录 /
            工艺过程记录 / 生产事件记录。模板可整本下载（多工作表），也可按类别单独下载。
          </p>
        </div>
      </section>
    </>
  );
}
