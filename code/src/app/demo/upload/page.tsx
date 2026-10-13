'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileUploader, type UploadedFileItem } from '@/components/upload/file-uploader';
import { ImageUploader } from '@/components/upload/image-uploader';

/** 文件上传示例：多文件上传 + 单图上传 */
export default function UploadDemoPage() {
  const [files, setFiles] = useState<UploadedFileItem[]>([]);
  const [avatar, setAvatar] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">文件上传</h1>
        <p className="mt-1 text-sm text-gray-500">
          默认写入 <code className="rounded bg-gray-100 px-1.5 py-0.5">public/uploads</code>；
          配置 MinIO 后自动切换到对象存储，上传记录统一写入 uploaded_files 表。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">多文件上传</CardTitle>
        </CardHeader>
        <CardContent>
          <FileUploader files={files} onChange={setFiles} bizType="demo" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">单图上传（头像 / 封面）</CardTitle>
        </CardHeader>
        <CardContent>
          <ImageUploader value={avatar} onChange={setAvatar} bizType="demo-avatar" />
        </CardContent>
      </Card>

      {(files.length > 0 || avatar) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">上传结果</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-auto rounded-lg bg-gray-900 p-4 text-xs text-gray-100">
              {JSON.stringify({ files, avatar }, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
