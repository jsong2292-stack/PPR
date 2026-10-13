import nextTs from 'eslint-config-next/typescript';
import nextVitals from 'eslint-config-next/core-web-vitals';
import { defineConfig, globalIgnores } from 'eslint/config';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    // eslint-config-next 默认忽略
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // 构建产物
    'server.js',
    'dist/**',
    // 运维脚本（CommonJS）
    'scripts/**/*.js',
  ]),

  {
    rules: {
      /**
       * 本脚手架大量使用「挂载后请求接口 → setState 填充页面」的写法，
       * 以及「props 变化 → 同步到本地 state」的写法，这是有意的数据流：
       * 数据来源是 HTTP 接口而不是 React 外部 store。
       * 该规则在 React 19 的编译器预设下会把这些正常写法判为错误，故关闭。
       */
      'react-hooks/set-state-in-effect': 'off',

      /**
       * 上传文件、用户头像等地址在运行时才由接口返回，
       * next/image 需要预先登记域名白名单，这里统一使用原生 img。
       */
      '@next/next/no-img-element': 'off',

      // 允许在确有必要时使用 any（例如第三方库类型缺失处）
      '@typescript-eslint/no-explicit-any': 'warn',

      // 未使用变量按错误处理，但允许以 _ 开头的占位参数
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
]);

export default eslintConfig;
