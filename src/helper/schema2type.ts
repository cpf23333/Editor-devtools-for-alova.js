import { OpenAPIV3_1 } from 'openapi-types';
import { format } from '../utils';
import { findBy$ref, get$refName, isReferenceObject } from './openapi';

export interface Schema2TypeOptions {
  deep?: boolean; // 是否递归解析
  defaultType?: 'any' | 'unknown'; // 未匹配的时的默认类型
  commentStyle?: 'line' | 'docment'; // 注释风格
  preText?: string; // 注释前缀
  on$Ref?: (refOject: OpenAPIV3_1.ReferenceObject) => void;
}
/**
 * 生成注释字符串
 * @param type 注释风格
 * @returns 注释对象
 */
export function comment(type: 'line' | 'docment') {
  const startText = type === 'docment' ? '/**\n' : '';
  const endText = type === 'docment' ? '\n */\n' : '\n';
  let str = '';
  let idx = 0;
  const preText = type === 'docment' ? ' *' : '//';
  const docmentKeyArr = [['[deprecated]', '@deprecated']];
  const docmentTransformeKeyArr: Array<[string, (text: string) => string]> = [
    [
      '[title]',
      (text: string) => {
        const [, nextText = ''] = /\[title\](.*)/.exec(text) ?? [];
        return `${nextText.trim()}\n---`;
      }
    ]
  ];
  const transformeText = (text: string) => {
    if (type === 'line') {
      return text;
    }
    const docmentTransformeFn = docmentTransformeKeyArr.find(item => text.startsWith(item[0]));
    if (docmentTransformeFn) {
      return docmentTransformeFn[1](text);
    }
    return docmentKeyArr.find(item => item[0] === text)?.[1] ?? text;
  };
  return {
    add(text: string) {
      if (idx) {
        str += '\n';
      }
      str += transformeText(text)
        .split('\n')
        .map(item => `${preText} ${item}`)
        .join('\n');
      idx++;
    },
    end() {
      if (!str) {
        return str;
      }
      return startText + str + endText;
    }
  };
}
/**
 * 将schema解析为ts类型字符串
 * @param schemaOrigin schema对象
 * @param openApi openApi对象
 * @param config 配置项
 * @returns ts类型字符串
 */
function parseSchema(
  schemaOrigin: OpenAPIV3_1.SchemaObject | OpenAPIV3_1.ReferenceObject,
  openApi: OpenAPIV3_1.Document,
  config: Schema2TypeOptions
): string {
  let schema: OpenAPIV3_1.SchemaObject = schemaOrigin;
  if (isReferenceObject(schemaOrigin)) {
    config.on$Ref?.(schemaOrigin);
    if (!config.deep) {
      return get$refName(schemaOrigin.$ref);
    }
    schema = findBy$ref(schemaOrigin.$ref, openApi);
  }
  if (schema.enum) {
    return parseEnum(schema);
  }
  switch (schema.type) {
    case 'object':
      return parseObject(schema, openApi, config);
    case 'array':
      return parseArray(schema, openApi, config);
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    default:
      if (schema.oneOf) {
        return schema.oneOf.map(item => parseSchema(item, openApi, config)).join(' | ');
      }
      return typeof schema.type === 'string'
        ? (schema.type || config.defaultType) ?? 'unknown'
        : config.defaultType ?? 'unknown';
  }
}
/**
 *将object类型的schema解析为ts类型字符串
 * @param schema schema对象
 * @param openApi openApi对象
 * @param config 配置项
 * @returns  ts类型字符串
 */
function parseObject(
  schema: OpenAPIV3_1.SchemaObject,
  openApi: OpenAPIV3_1.Document,
  config: Schema2TypeOptions
): string {
  const properties = schema.properties || {};
  const required = new Set(schema.required ?? []);
  const lines: string[] = [`{`];
  for (const [key, valueOrigin] of Object.entries(properties)) {
    const optionalFlag = required.has(key) ? '' : '?';
    const value = isReferenceObject(valueOrigin) ? findBy$ref(valueOrigin.$ref, openApi) : valueOrigin;
    const type = parseSchema(valueOrigin, openApi, config);
    let valueStr = '';
    const doc = comment(config.commentStyle ?? 'line');
    if (value.title) {
      doc.add(`[title] ${value.title}`);
    }
    if (value.description) {
      doc.add(value.description);
    }
    if (required.has(key)) {
      doc.add('[required]');
    }
    if (value.deprecated) {
      doc.add('[deprecated]');
    }
    valueStr = doc.end() + `${key}${optionalFlag}: ${type};`;
    valueStr.split('\n').forEach(line => lines.push(' ' + line));
  }
  lines.push(`}`);
  return lines.length > 2 ? lines.join('\n') : 'object';
}
/**
 * 将array类型的schema解析为ts类型字符串
 * @param schema schema对象
 * @param openApi openApi对象
 * @param config 配置项
 * @returns ts类型字符串
 */
function parseArray(
  schema: OpenAPIV3_1.ArraySchemaObject,
  openApi: OpenAPIV3_1.Document,
  config: Schema2TypeOptions
): string {
  if (Array.isArray(schema.items)) {
    const types = schema.items.map(item => parseSchema(item, openApi, config));
    return `[\n${types.map(type => `${type},\n`)}\n]`;
  } else if (schema.items) {
    let items: OpenAPIV3_1.SchemaObject = schema.items;
    if (isReferenceObject(schema.items)) {
      if (!config.deep) {
        config.on$Ref?.(schema.items);
        return `${get$refName(schema.items.$ref)}[]`;
      }
      items = findBy$ref(schema.items.$ref, openApi);
    }
    const type = parseSchema(items, openApi, config);
    switch (items.type) {
      case 'object':
        return `Array<${type}>`;
      case 'array':
        return `${type}[]`;
      default:
        break;
    }
    if (items.oneOf || items.enum) {
      return `(${type})[]`;
    }
    return `${type}[]`;
  }
  return '[]';
}
/**
 * 将enum类型的schema解析为ts类型字符串
 * @param schema schema对象
 * @returns ts类型字符串
 */
function parseEnum(schema: OpenAPIV3_1.SchemaObject): string {
  return schema.enum?.map?.((value: any) => JSON.stringify(value))?.join?.(' | ') || '';
}
/**
 * 将schema解析为格式化后的ts类型字符串
 * @param schemaOrigin schema对象
 * @param openApi openapi文档对象
 * @param config 配置项
 * @returns 格式化后的ts类型字符串
 */
export async function convertToType(
  schemaOrigin: OpenAPIV3_1.SchemaObject | OpenAPIV3_1.ReferenceObject,
  openApi: OpenAPIV3_1.Document,
  config: Schema2TypeOptions = {
    deep: true,
    defaultType: 'unknown',
    commentStyle: 'line',
    preText: ''
  }
): Promise<string> {
  if (!schemaOrigin) {
    return config.defaultType ?? 'unknown';
  }
  const tsStr = parseSchema(schemaOrigin, openApi, config);
  // 格式化ts类型
  const tsStrFormat = await format(`type Ts = ${tsStr}`, {
    semi: false // 去掉分号
  });
  const resultFormat = /type Ts = (.*)/s.exec(tsStrFormat)?.[1] ?? '';
  const tsStrArr = resultFormat.trim().split('\n');
  // 加前缀，便于生成注释
  return tsStrArr.map((line, idx) => (idx ? config.preText : '') + line).join('\n');
}
interface JsonSchema2TsOptions {
  export?: boolean;
  deep?: boolean;
  on$RefTsStr?: (name: string, tsStr: string) => void;
}
/**
 * 将schema对象解析为ts类型字符串
 * @param schema schema对象
 * @param name 类型名称
 * @param openApi openapi文档对象
 * @param options 配置项
 * @returns interface Ts字符串
 */
export const jsonSchema2TsStr = async (
  schema: OpenAPIV3_1.SchemaObject | OpenAPIV3_1.ReferenceObject,
  name: string,
  openApi: OpenAPIV3_1.Document,
  options: JsonSchema2TsOptions = { export: false },
  map: Map<string, string> = new Map()
): Promise<string> => {
  const tsStr = await convertToType(schema, openApi, {
    deep: options.deep,
    defaultType: 'unknown',
    commentStyle: 'docment',
    preText: '',
    async on$Ref(refObject) {
      if (options.on$RefTsStr) {
        const name = get$refName(refObject.$ref);
        if (map.has(name)) {
          options.on$RefTsStr(name, map.get(name) ?? '');
          return;
        }
        const result = await jsonSchema2TsStr(findBy$ref(refObject.$ref, openApi), name, openApi, options, map);
        map.set(name, result);
        options.on$RefTsStr(name, result);
      }
    }
  });
  let result = `interface ${name} ${tsStr}`;
  if (options.export) {
    result = `export ${result}`;
  }
  return result;
};
