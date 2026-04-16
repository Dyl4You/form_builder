const crypto = require('crypto');

const { Pool } = require('pg');

const { TEMPLATE_LIBRARY_SCHEMA_SQL } = require('./templateLibrarySchema');

function jsonOrDefault(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toBuffer(value) {
  if (value == null) return null;
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

function normalizeWorkspaceId(value) {
  const workspaceId = String(value || '').trim();
  return workspaceId || null;
}

function extensionForContentType(contentType) {
  switch (String(contentType || '').trim().toLowerCase()) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}

function encodeCursor(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    return {
      latestSavedAt: parsed?.latestSavedAt ? new Date(parsed.latestSavedAt).toISOString() : null,
      templateId: String(parsed?.templateId || '').trim() || null
    };
  } catch {
    return null;
  }
}

function mapWorkspaceRow(row = {}) {
  return {
    workspaceId: row.workspace_id || 'default',
    displayName: row.display_name || 'Default Workspace',
    templatesSaved: Math.max(0, Math.floor(toFiniteNumber(row.templates_saved))),
    componentsTotal: Math.max(0, Math.floor(toFiniteNumber(row.components_total))),
    xpTotal: Math.max(0, Math.floor(toFiniteNumber(row.xp_total))),
    level: Math.max(1, Math.floor(toFiniteNumber(row.level)) || 1),
    streak: {
      current: Math.max(0, Math.floor(toFiniteNumber(row.streak_current))),
      longest: Math.max(0, Math.floor(toFiniteNumber(row.streak_longest))),
      lastActiveDate: row.streak_last_active_date
        ? new Date(row.streak_last_active_date).toISOString().slice(0, 10)
        : null
    },
    handcraftedChain: Math.max(0, Math.floor(toFiniteNumber(row.handcrafted_chain))),
    neglectedRevivalCount: Math.max(0, Math.floor(toFiniteNumber(row.neglected_revival_count))),
    achievementsUnlocked: jsonOrDefault(row.achievements_unlocked, []),
    lastFingerprintByTemplateName: jsonOrDefault(row.last_fingerprint_by_template_name, {})
  };
}

function mapTemplateSummaryRow(row = {}) {
  return {
    templateId: row.template_id || null,
    currentVersionId: row.current_version_id || null,
    displayName: row.display_name || '',
    nameSource: row.name_source || 'manual',
    status: row.status || 'active',
    canLoad: Boolean(row.can_load),
    latestSavedAt: row.latest_saved_at || row.saved_at || null,
    archivedAt: row.archived_at || null,
    totalComponents: Math.max(0, Math.floor(toFiniteNumber(row.total_components))),
    uniqueTypes: Math.max(0, Math.floor(toFiniteNumber(row.unique_types))),
    conditionalCount: row.conditional_count == null ? null : Math.max(0, Math.floor(toFiniteNumber(row.conditional_count))),
    calculationCount: row.calculation_count == null ? null : Math.max(0, Math.floor(toFiniteNumber(row.calculation_count))),
    sessionElapsedMs: row.session_elapsed_ms == null ? null : Math.max(0, Math.floor(toFiniteNumber(row.session_elapsed_ms))),
    topMix: [],
    hasCoverImage: Boolean(row.cover_blob_key),
    coverUpdatedAt: row.cover_updated_at || null,
    versionCount: Math.max(0, Math.floor(toFiniteNumber(row.version_count))),
    savedAt: row.saved_at || row.latest_saved_at || null
  };
}

class PostgresTemplateLibraryStore {
  constructor(options = {}) {
    this.workspaceId = Object.prototype.hasOwnProperty.call(options, 'workspaceId')
      ? normalizeWorkspaceId(options.workspaceId)
      : normalizeWorkspaceId(process.env.TEMPLATE_WORKSPACE_ID || 'default');
    this.displayName = options.workspaceDisplayName || process.env.TEMPLATE_WORKSPACE_NAME || 'Default Workspace';
    this.pool = options.pool || new Pool({
      connectionString: options.connectionString || process.env.DATABASE_URL,
      max: Number(process.env.PG_POOL_MAX || 10) || 10
    });
    this.blobStore = options.blobStore;
    this.readyPromise = null;
  }

  getStoreKind() {
    return 'postgres';
  }

  async ensureReady() {
    if (!this.readyPromise) {
      this.readyPromise = (async () => {
        if (!this.blobStore) {
          throw new Error('Template library store requires a blobStore.');
        }
        await this.blobStore.ensureReady();
        await this.pool.query(TEMPLATE_LIBRARY_SCHEMA_SQL);
        if (this.workspaceId) {
          await this.pool.query(
            `INSERT INTO workspaces (workspace_id, display_name)
             VALUES ($1, $2)
             ON CONFLICT (workspace_id)
             DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = NOW()`,
            [this.workspaceId, this.displayName]
          );
        }
      })();
    }

    return this.readyPromise;
  }

  async close() {
    await this.pool.end();
  }

  async getWorkspaceProfile(workspaceId = this.workspaceId) {
    await this.ensureReady();
    if (!normalizeWorkspaceId(workspaceId)) {
      throw new Error('workspaceId is required.');
    }
    const result = await this.pool.query(
      `SELECT *
         FROM workspaces
        WHERE workspace_id = $1`,
      [workspaceId]
    );

    if (!result.rows[0]) {
      return mapWorkspaceRow({ workspace_id: workspaceId, display_name: this.displayName });
    }

    return mapWorkspaceRow(result.rows[0]);
  }

  async ensureWorkspaceUser(input = {}) {
    await this.ensureReady();
    const workspaceId = normalizeWorkspaceId(input.workspaceId || input.userId || this.workspaceId);
    if (!workspaceId) {
      throw new Error('workspaceId is required.');
    }

    const userId = String(input.userId || workspaceId).trim();
    const provider = String(input.provider || 'google').trim() || 'google';
    const providerUserId = String(input.providerUserId || userId).trim() || userId;
    const email = String(input.email || '').trim().toLowerCase();
    const displayName = String(input.displayName || email || this.displayName).trim() || this.displayName;
    const role = String(input.role || 'user').trim() === 'admin' ? 'admin' : 'user';

    await this.pool.query(
      `INSERT INTO workspaces (workspace_id, display_name)
       VALUES ($1, $2)
       ON CONFLICT (workspace_id)
       DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = NOW()`,
      [workspaceId, displayName]
    );

    await this.pool.query(
      `INSERT INTO users (
         user_id,
         workspace_id,
         provider,
         provider_user_id,
         email,
         display_name,
         role
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id)
       DO UPDATE SET
         workspace_id = EXCLUDED.workspace_id,
         provider = EXCLUDED.provider,
         provider_user_id = EXCLUDED.provider_user_id,
         email = EXCLUDED.email,
         display_name = EXCLUDED.display_name,
         role = EXCLUDED.role,
         updated_at = NOW()`,
      [userId, workspaceId, provider, providerUserId, email, displayName, role]
    );

    return {
      userId,
      workspaceId,
      email,
      displayName,
      role
    };
  }

  async saveNewTemplate(input) {
    return this.#saveVersion({ ...input, templateMode: 'create' });
  }

  async saveNewVersion(input) {
    return this.#saveVersion({ ...input, templateMode: 'version' });
  }

  async #saveVersion(input = {}) {
    await this.ensureReady();

    const workspaceId = input.workspaceId || this.workspaceId;
    const savedAtIso = new Date(input.savedAt || Date.now()).toISOString();
    const ymd = String(input.ymd || savedAtIso.slice(0, 10)).slice(0, 10);
    const templateId = input.templateId || `tpl_${savedAtIso.slice(0, 10).replace(/-/g, '')}_${crypto.randomUUID().slice(0, 8)}`;
    const versionId = input.versionId || `ver_${crypto.randomUUID()}`;
    const componentBreakdown = Array.isArray(input.componentBreakdown) ? input.componentBreakdown : [];
    const currentVersionId = input.currentVersionId || null;
    const templateCoverBuffer = toBuffer(input.templateCover?.buffer);
    const templateCoverContentType = String(input.templateCover?.contentType || 'application/octet-stream').trim();

    let blobUpload = null;
    let coverUpload = null;
    if (input.canLoad && input.json) {
      const blobKey = input.blobKey || `templates/${workspaceId}/${templateId}/${String(input.versionNumber || 'pending')}.json.gz`;
      blobUpload = await this.blobStore.putJson(blobKey, input.json);
    }
    if (templateCoverBuffer) {
      const coverBlobKey = input.coverBlobKey || `template-covers/${workspaceId}/${templateId}/${String(input.versionNumber || 'pending')}.${extensionForContentType(templateCoverContentType)}`;
      coverUpload = await this.blobStore.putBuffer(coverBlobKey, templateCoverBuffer, {
        contentType: templateCoverContentType,
        cacheControl: 'public, max-age=31536000, immutable'
      });
    }

    const client = await this.pool.connect();
    let insertedVersionNumber = Number(input.versionNumber) || 0;
    let previousCoverBlobKey = null;

    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO workspaces (workspace_id, display_name)
         VALUES ($1, $2)
         ON CONFLICT (workspace_id)
         DO UPDATE SET updated_at = NOW()`,
        [workspaceId, this.displayName]
      );

      let existingTemplate = null;
      if (input.templateMode === 'version') {
        const templateResult = await client.query(
          `SELECT *
             FROM templates
            WHERE template_id = $1
              AND workspace_id = $2
            FOR UPDATE`,
          [templateId, workspaceId]
        );
        existingTemplate = templateResult.rows[0] || null;
        if (!existingTemplate) {
          throw new Error('Cannot create a version for a template that does not exist.');
        }
        previousCoverBlobKey = existingTemplate.cover_blob_key || null;
      }

      if (input.templateMode === 'create') {
        await client.query(
          `INSERT INTO templates (
             template_id,
             workspace_id,
             display_name,
             name_source,
             status,
             first_saved_at,
             latest_saved_at
           )
           VALUES ($1, $2, $3, $4, 'active', $5, $5)`,
          [
            templateId,
            workspaceId,
            input.displayName,
            input.nameSource,
            savedAtIso
          ]
        );
        insertedVersionNumber = Number(input.versionNumber) || 1;
      } else {
        const versionResult = await client.query(
          `SELECT COALESCE(MAX(version_number), 0) AS max_version
             FROM template_versions
            WHERE template_id = $1`,
          [templateId]
        );
        insertedVersionNumber = Number(input.versionNumber) || (Number(versionResult.rows[0]?.max_version) + 1);
      }

      const resolvedBlobKey = input.canLoad
        ? (input.blobKey || `templates/${workspaceId}/${templateId}/${insertedVersionNumber}.json.gz`)
        : null;
      const resolvedCoverBlobKey = templateCoverBuffer
        ? (input.coverBlobKey || `template-covers/${workspaceId}/${templateId}/${insertedVersionNumber}.${extensionForContentType(templateCoverContentType)}`)
        : null;

      if (blobUpload && blobUpload.blobKey !== resolvedBlobKey) {
        await this.blobStore.delete(blobUpload.blobKey);
        blobUpload = await this.blobStore.putJson(resolvedBlobKey, input.json);
      }
      if (coverUpload && coverUpload.blobKey !== resolvedCoverBlobKey) {
        await this.blobStore.delete(coverUpload.blobKey);
        coverUpload = await this.blobStore.putBuffer(resolvedCoverBlobKey, templateCoverBuffer, {
          contentType: templateCoverContentType,
          cacheControl: 'public, max-age=31536000, immutable'
        });
      }

      await client.query(
        `INSERT INTO template_versions (
           version_id,
           workspace_id,
           template_id,
           version_number,
           saved_at,
           ymd,
           display_name,
           name_source,
           notes,
           fingerprint,
           can_load,
           blob_key,
           blob_size_bytes,
           total_components,
           unique_types,
           conditional_count,
           calculation_count,
           session_elapsed_ms,
           max_depth,
           advanced_feature_count,
           scores,
           action_counts,
           xp,
           component_genome,
           telemetry
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13,
           $14, $15, $16, $17, $18, $19, $20, $21::jsonb, $22::jsonb, $23::jsonb, $24::jsonb, $25::jsonb
         )`,
        [
          versionId,
          workspaceId,
          templateId,
          insertedVersionNumber,
          savedAtIso,
          ymd,
          input.displayName,
          input.nameSource,
          JSON.stringify(input.notes || {}),
          input.fingerprint,
          Boolean(input.canLoad),
          resolvedBlobKey,
          Math.max(0, Math.floor(toFiniteNumber(blobUpload?.sizeBytes || input.blobSizeBytes))),
          Math.max(0, Math.floor(toFiniteNumber(input.templateStats?.totalComponents))),
          Math.max(0, Math.floor(toFiniteNumber(input.templateStats?.uniqueTypes))),
          input.templateStats?.conditionalCount == null ? null : Math.max(0, Math.floor(toFiniteNumber(input.templateStats?.conditionalCount))),
          input.templateStats?.calculationCount == null ? null : Math.max(0, Math.floor(toFiniteNumber(input.templateStats?.calculationCount))),
          input.templateStats?.sessionElapsedMs == null ? null : Math.max(0, Math.floor(toFiniteNumber(input.templateStats?.sessionElapsedMs))),
          Math.max(0, Math.floor(toFiniteNumber(input.maxDepth))),
          Math.max(0, Math.floor(toFiniteNumber(input.advancedFeatureCount))),
          JSON.stringify(input.scores || {}),
          JSON.stringify(input.actionCounts || {}),
          JSON.stringify(input.xp || {}),
          JSON.stringify(input.componentGenome || {}),
          JSON.stringify(input.telemetry || {})
        ]
      );

      if (componentBreakdown.length) {
        const inserts = [];
        const values = [];
        componentBreakdown.forEach((entry, index) => {
          const offset = index * 3;
          inserts.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
          values.push(versionId, String(entry.type || '').trim(), Math.max(0, Math.floor(toFiniteNumber(entry.count))));
        });

        await client.query(
          `INSERT INTO template_version_component_counts (
             version_id,
             component_type,
             component_count
           ) VALUES ${inserts.join(', ')}`,
          values
        );
      }

      const templateUpdateValues = [
        templateId,
        versionId,
        input.displayName,
        input.nameSource,
        savedAtIso
      ];
      const templateUpdateAssignments = [
        'current_version_id = $2',
        'display_name = $3',
        'name_source = $4',
        'latest_saved_at = $5',
        'updated_at = NOW()',
        `status = 'active'`,
        'archived_at = NULL',
        'archived_reason = NULL'
      ];
      if (coverUpload?.blobKey) {
        templateUpdateValues.push(
          resolvedCoverBlobKey,
          templateCoverContentType,
          input.templateCover?.prompt || null,
          input.templateCover?.updatedAt || savedAtIso
        );
        templateUpdateAssignments.push(
          `cover_blob_key = $${templateUpdateValues.length - 3}`,
          `cover_content_type = $${templateUpdateValues.length - 2}`,
          `cover_prompt = $${templateUpdateValues.length - 1}`,
          `cover_updated_at = $${templateUpdateValues.length}`
        );
      }
      await client.query(
        `UPDATE templates
            SET ${templateUpdateAssignments.join(',\n                ')}
          WHERE template_id = $1`,
        templateUpdateValues
      );

      const profile = input.workspaceProfile || {};
      await client.query(
        `UPDATE workspaces
            SET templates_saved = $2,
                components_total = $3,
                xp_total = $4,
                level = $5,
                streak_current = $6,
                streak_longest = $7,
                streak_last_active_date = $8,
                handcrafted_chain = $9,
                neglected_revival_count = $10,
                achievements_unlocked = $11::jsonb,
                last_fingerprint_by_template_name = $12::jsonb,
                updated_at = NOW()
          WHERE workspace_id = $1`,
        [
          workspaceId,
          Math.max(0, Math.floor(toFiniteNumber(profile.templatesSaved))),
          Math.max(0, Math.floor(toFiniteNumber(profile.componentsTotal))),
          Math.max(0, Math.floor(toFiniteNumber(profile.xpTotal))),
          Math.max(1, Math.floor(toFiniteNumber(profile.level)) || 1),
          Math.max(0, Math.floor(toFiniteNumber(profile.streak?.current))),
          Math.max(0, Math.floor(toFiniteNumber(profile.streak?.longest))),
          profile.streak?.lastActiveDate || null,
          Math.max(0, Math.floor(toFiniteNumber(profile.handcraftedChain))),
          Math.max(0, Math.floor(toFiniteNumber(profile.neglectedRevivalCount))),
          JSON.stringify(profile.achievementsUnlocked || []),
          JSON.stringify(profile.lastFingerprintByTemplateName || {})
        ]
      );

      if (componentBreakdown.length) {
        for (const entry of componentBreakdown) {
          const componentType = String(entry.type || '').trim();
          const componentCount = Math.max(0, Math.floor(toFiniteNumber(entry.count)));
          if (!componentType || componentCount < 1) continue;

          await client.query(
            `INSERT INTO workspace_component_totals (
               workspace_id,
               component_type,
               component_count
             ) VALUES ($1, $2, $3)
             ON CONFLICT (workspace_id, component_type)
             DO UPDATE
                   SET component_count = workspace_component_totals.component_count + EXCLUDED.component_count`,
            [workspaceId, componentType, componentCount]
          );
        }
      }

      await client.query(
        `INSERT INTO workspace_daily_stats (
           workspace_id,
           ymd,
           versions_saved,
           xp_gained,
           mastery_sum,
           mastery_count
         ) VALUES ($1, $2, 1, $3, $4, 1)
         ON CONFLICT (workspace_id, ymd)
         DO UPDATE
               SET versions_saved = workspace_daily_stats.versions_saved + 1,
                   xp_gained = workspace_daily_stats.xp_gained + EXCLUDED.xp_gained,
                   mastery_sum = workspace_daily_stats.mastery_sum + EXCLUDED.mastery_sum,
                   mastery_count = workspace_daily_stats.mastery_count + 1`,
        [
          workspaceId,
          ymd,
          Math.max(0, Math.floor(toFiniteNumber(input.xp?.xpGained))),
          Number(toFiniteNumber(input.scores?.masteryScore).toFixed(2))
        ]
      );

      await client.query('COMMIT');

      if (coverUpload?.blobKey && previousCoverBlobKey && previousCoverBlobKey !== coverUpload.blobKey) {
        await this.blobStore.delete(previousCoverBlobKey).catch(() => {});
      }

      return {
        templateId,
        versionId,
        currentVersionId,
        versionNumber: insertedVersionNumber,
        savedAt: savedAtIso,
        blobKey: resolvedBlobKey,
        blobSizeBytes: Math.max(0, Math.floor(toFiniteNumber(blobUpload?.sizeBytes || input.blobSizeBytes))),
        coverBlobKey: coverUpload?.blobKey || previousCoverBlobKey || null
      };
    } catch (err) {
      await client.query('ROLLBACK');
      if (blobUpload?.blobKey) {
        await this.blobStore.delete(blobUpload.blobKey).catch(() => {});
      }
      if (coverUpload?.blobKey) {
        await this.blobStore.delete(coverUpload.blobKey).catch(() => {});
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async listTemplates(filters = {}) {
    await this.ensureReady();

    const workspaceId = filters.workspaceId || this.workspaceId;
    const limit = Math.min(100, Math.max(1, Math.floor(toFiniteNumber(filters.limit)) || 25));
    const cursor = decodeCursor(filters.cursor);

    const where = ['t.workspace_id = $1'];
    const values = [workspaceId];
    let index = values.length;

    const status = String(filters.status || 'active').trim().toLowerCase();
    if (status === 'active' || status === 'archived') {
      values.push(status);
      index += 1;
      where.push(`t.status = $${index}`);
    }

    const search = String(filters.q || '').trim();
    if (search) {
      values.push(`%${search}%`);
      index += 1;
      where.push(`t.display_name ILIKE $${index}`);
    }

    if (filters.savedFrom) {
      values.push(String(filters.savedFrom).slice(0, 10));
      index += 1;
      where.push(`t.latest_saved_at >= $${index}::date`);
    }

    if (filters.savedTo) {
      values.push(String(filters.savedTo).slice(0, 10));
      index += 1;
      where.push(`t.latest_saved_at < ($${index}::date + INTERVAL '1 day')`);
    }

    const canLoad = String(filters.canLoad || 'any').trim().toLowerCase();
    if (canLoad === 'yes' || canLoad === 'no') {
      values.push(canLoad === 'yes');
      index += 1;
      where.push(`cv.can_load = $${index}`);
    }

    const componentType = String(filters.componentType || '').trim();
    if (componentType) {
      values.push(componentType);
      index += 1;
      where.push(`EXISTS (
        SELECT 1
          FROM template_version_component_counts filter_counts
         WHERE filter_counts.version_id = cv.version_id
           AND filter_counts.component_type = $${index}
           AND filter_counts.component_count > 0
      )`);
    }

    if (cursor?.latestSavedAt && cursor?.templateId) {
      values.push(cursor.latestSavedAt, cursor.templateId);
      const savedIndex = index + 1;
      const templateIndex = index + 2;
      index += 2;
      where.push(`(
        t.latest_saved_at < $${savedIndex}::timestamptz
        OR (
          t.latest_saved_at = $${savedIndex}::timestamptz
          AND t.template_id < $${templateIndex}
        )
      )`);
    }

    values.push(limit + 1);
    index += 1;

    const result = await this.pool.query(
      `SELECT
         t.template_id,
         t.current_version_id,
         t.display_name,
         t.name_source,
         t.status,
         t.latest_saved_at,
         t.archived_at,
         cv.saved_at,
         cv.can_load,
         cv.total_components,
         cv.unique_types,
         cv.conditional_count,
         cv.calculation_count,
         cv.session_elapsed_ms,
         t.cover_blob_key,
         t.cover_updated_at,
         counts.version_count
       FROM templates t
       JOIN template_versions cv
         ON cv.version_id = t.current_version_id
       LEFT JOIN (
         SELECT template_id, COUNT(*) AS version_count
           FROM template_versions
          GROUP BY template_id
       ) counts
         ON counts.template_id = t.template_id
      WHERE ${where.join('\n        AND ')}
      ORDER BY t.latest_saved_at DESC, t.template_id DESC
      LIMIT $${index}`,
      values
    );

    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
    const summaries = rows.map(mapTemplateSummaryRow);
    const topMixByVersionId = await this.getTopMixByVersionIds(summaries.map((item) => item.currentVersionId));
    summaries.forEach((item) => {
      item.topMix = topMixByVersionId.get(item.currentVersionId) || [];
    });

    const lastItem = summaries[summaries.length - 1] || null;
    return {
      items: summaries,
      nextCursor: hasMore && lastItem
        ? encodeCursor({
          latestSavedAt: lastItem.latestSavedAt,
          templateId: lastItem.templateId
        })
        : null,
      hasMore
    };
  }

  async getTopMixByVersionIds(versionIds = []) {
    const uniqueIds = Array.from(new Set((versionIds || []).filter(Boolean)));
    if (!uniqueIds.length) return new Map();

    const result = await this.pool.query(
      `SELECT version_id, component_type, component_count
         FROM template_version_component_counts
        WHERE version_id = ANY($1::text[])
        ORDER BY version_id ASC, component_count DESC, component_type ASC`,
      [uniqueIds]
    );

    const grouped = new Map();
    result.rows.forEach((row) => {
      const list = grouped.get(row.version_id) || [];
      if (list.length >= 4) return;
      list.push({
        type: row.component_type,
        count: Math.max(0, Math.floor(toFiniteNumber(row.component_count)))
      });
      grouped.set(row.version_id, list);
    });
    return grouped;
  }

  async getTemplateSummary(templateId, workspaceId = this.workspaceId) {
    await this.ensureReady();
    const result = await this.pool.query(
      `SELECT
         t.template_id,
         t.current_version_id,
         t.display_name,
         t.name_source,
         t.status,
         t.latest_saved_at,
         t.archived_at,
         cv.saved_at,
         cv.can_load,
         cv.total_components,
         cv.unique_types,
         cv.conditional_count,
         cv.calculation_count,
         cv.session_elapsed_ms,
         t.cover_blob_key,
         t.cover_updated_at,
         version_counts.version_count
       FROM templates t
       JOIN template_versions cv
         ON cv.version_id = t.current_version_id
       LEFT JOIN (
         SELECT template_id, COUNT(*) AS version_count
           FROM template_versions
          GROUP BY template_id
       ) version_counts
         ON version_counts.template_id = t.template_id
      WHERE t.workspace_id = $1
        AND t.template_id = $2`,
      [workspaceId, templateId]
    );

    const row = result.rows[0];
    if (!row) return null;

    const summary = mapTemplateSummaryRow(row);
    const topMix = await this.getTopMixByVersionIds([summary.currentVersionId]);
    summary.topMix = topMix.get(summary.currentVersionId) || [];
    return summary;
  }

  async getTemplateCover(templateId, workspaceId = this.workspaceId) {
    await this.ensureReady();
    const result = await this.pool.query(
      `SELECT template_id, cover_blob_key, cover_content_type, cover_updated_at
         FROM templates
        WHERE workspace_id = $1
          AND template_id = $2`,
      [workspaceId, templateId]
    );
    const row = result.rows[0];
    if (!row?.cover_blob_key || !row?.cover_content_type) {
      return null;
    }

    return {
      templateId: row.template_id,
      contentType: row.cover_content_type,
      updatedAt: row.cover_updated_at || null,
      buffer: await this.blobStore.getBuffer(row.cover_blob_key)
    };
  }

  async updateTemplateCover(input = {}) {
    await this.ensureReady();

    const workspaceId = input.workspaceId || this.workspaceId;
    const templateId = String(input.templateId || '').trim();
    const expectedVersionId = String(input.expectedVersionId || '').trim();
    const templateCoverBuffer = toBuffer(input.templateCover?.buffer);
    const templateCoverContentType = String(input.templateCover?.contentType || 'application/octet-stream').trim();

    if (!templateId || !templateCoverBuffer) {
      return {
        updated: false,
        reason: templateId ? 'missing-cover' : 'missing-template'
      };
    }

    const client = await this.pool.connect();
    let coverUpload = null;

    try {
      await client.query('BEGIN');

      const templateResult = await client.query(
        `SELECT current_version_id, cover_blob_key
           FROM templates
          WHERE workspace_id = $1
            AND template_id = $2
          FOR UPDATE`,
        [workspaceId, templateId]
      );
      const templateRow = templateResult.rows[0];
      if (!templateRow) {
        await client.query('ROLLBACK');
        return { updated: false, reason: 'missing-template' };
      }
      if (expectedVersionId && templateRow.current_version_id !== expectedVersionId) {
        await client.query('ROLLBACK');
        return { updated: false, reason: 'stale-version' };
      }

      const coverVersionKey = expectedVersionId || templateRow.current_version_id || 'cover';
      const resolvedCoverBlobKey = input.coverBlobKey || `template-covers/${workspaceId}/${templateId}/${coverVersionKey}.${extensionForContentType(templateCoverContentType)}`;
      coverUpload = await this.blobStore.putBuffer(resolvedCoverBlobKey, templateCoverBuffer, {
        contentType: templateCoverContentType,
        cacheControl: 'public, max-age=31536000, immutable'
      });

      const updatedAt = input.templateCover?.updatedAt || new Date().toISOString();
      await client.query(
        `UPDATE templates
            SET cover_blob_key = $3,
                cover_content_type = $4,
                cover_prompt = $5,
                cover_updated_at = $6,
                updated_at = NOW()
          WHERE workspace_id = $1
            AND template_id = $2`,
        [
          workspaceId,
          templateId,
          coverUpload.blobKey,
          templateCoverContentType,
          input.templateCover?.prompt || null,
          updatedAt
        ]
      );

      await client.query('COMMIT');

      const previousCoverBlobKey = templateRow.cover_blob_key || null;
      if (previousCoverBlobKey && previousCoverBlobKey !== coverUpload.blobKey) {
        await this.blobStore.delete(previousCoverBlobKey).catch(() => {});
      }

      return {
        updated: true,
        templateId,
        coverBlobKey: coverUpload.blobKey,
        coverUpdatedAt: updatedAt
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (coverUpload?.blobKey) {
        await this.blobStore.delete(coverUpload.blobKey).catch(() => {});
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async getTemplateVersionHistory(templateId, options = {}) {
    await this.ensureReady();
    const workspaceId = options.workspaceId || this.workspaceId;
    const limit = Math.min(50, Math.max(1, Math.floor(toFiniteNumber(options.limit)) || 10));
    const cursor = decodeCursor(options.cursor);
    const where = ['workspace_id = $1', 'template_id = $2'];
    const values = [workspaceId, templateId];
    let index = values.length;

    if (cursor?.latestSavedAt && cursor?.templateId) {
      values.push(cursor.latestSavedAt, Math.max(0, Math.floor(toFiniteNumber(cursor.templateId))));
      const savedAtIndex = index + 1;
      const versionIndex = index + 2;
      index += 2;
      where.push(`(saved_at, version_number) < ($${savedAtIndex}::timestamptz, $${versionIndex})`);
    }

    values.push(limit + 1);
    index += 1;

    const result = await this.pool.query(
      `SELECT
         version_id,
         version_number,
         saved_at,
         display_name,
         name_source,
         can_load,
         total_components,
         unique_types,
         conditional_count,
         calculation_count,
         session_elapsed_ms
       FROM template_versions
      WHERE ${where.join(' AND ')}
      ORDER BY saved_at DESC, version_number DESC
      LIMIT $${index}`,
      values
    );

    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
    const topMix = await this.getTopMixByVersionIds(rows.map((row) => row.version_id));
    const items = rows.map((row) => ({
      versionId: row.version_id,
      versionNumber: Math.max(1, Math.floor(toFiniteNumber(row.version_number))),
      savedAt: row.saved_at,
      displayName: row.display_name,
      nameSource: row.name_source,
      canLoad: Boolean(row.can_load),
      totalComponents: Math.max(0, Math.floor(toFiniteNumber(row.total_components))),
      uniqueTypes: Math.max(0, Math.floor(toFiniteNumber(row.unique_types))),
      conditionalCount: row.conditional_count == null ? null : Math.max(0, Math.floor(toFiniteNumber(row.conditional_count))),
      calculationCount: row.calculation_count == null ? null : Math.max(0, Math.floor(toFiniteNumber(row.calculation_count))),
      sessionElapsedMs: row.session_elapsed_ms == null ? null : Math.max(0, Math.floor(toFiniteNumber(row.session_elapsed_ms))),
      topMix: topMix.get(row.version_id) || []
    }));

    const lastRow = items[items.length - 1];
    return {
      items,
      nextCursor: hasMore && lastRow
        ? encodeCursor({
          latestSavedAt: lastRow.savedAt,
          templateId: lastRow.versionNumber
        })
        : null,
      hasMore
    };
  }

  async getVersionBlob(versionId, workspaceId = this.workspaceId) {
    await this.ensureReady();
    const result = await this.pool.query(
      `SELECT
         version_id,
         template_id,
         display_name,
         saved_at,
         session_elapsed_ms,
         can_load,
         blob_key
       FROM template_versions
      WHERE version_id = $1
        AND workspace_id = $2`,
      [versionId, workspaceId]
    );
    const row = result.rows[0];
    if (!row) return null;
    if (!row.can_load || !row.blob_key) {
      return {
        versionId,
        templateId: row.template_id,
        displayName: row.display_name,
        savedAt: row.saved_at,
        sessionElapsedMs: row.session_elapsed_ms == null ? null : Math.max(0, Math.floor(toFiniteNumber(row.session_elapsed_ms))),
        json: null
      };
    }

    return {
      versionId,
      templateId: row.template_id,
      displayName: row.display_name,
      savedAt: row.saved_at,
      sessionElapsedMs: row.session_elapsed_ms == null ? null : Math.max(0, Math.floor(toFiniteNumber(row.session_elapsed_ms))),
      json: await this.blobStore.getJson(row.blob_key)
    };
  }

  async archiveTemplate(templateId, workspaceId = this.workspaceId) {
    await this.ensureReady();
    const result = await this.pool.query(
      `UPDATE templates
          SET status = 'archived',
              archived_at = NOW(),
              updated_at = NOW()
        WHERE template_id = $1
          AND workspace_id = $2
          AND status <> 'archived'
      RETURNING template_id, display_name`,
      [templateId, workspaceId]
    );
    return result.rows[0] || null;
  }

  async restoreTemplate(templateId, workspaceId = this.workspaceId) {
    await this.ensureReady();
    const result = await this.pool.query(
      `UPDATE templates
          SET status = 'active',
              archived_at = NULL,
              archived_reason = NULL,
              updated_at = NOW()
        WHERE template_id = $1
          AND workspace_id = $2
      RETURNING template_id, display_name`,
      [templateId, workspaceId]
    );
    return result.rows[0] || null;
  }

  async getOverview(workspaceId = this.workspaceId) {
    await this.ensureReady();
    const [workspace, latestVersion, sessionStats, activeTemplates] = await Promise.all([
      this.getWorkspaceProfile(workspaceId),
      this.pool.query(
        `SELECT
           tv.version_id,
           tv.template_id,
           tv.saved_at,
           tv.display_name,
           tv.scores,
           tv.total_components,
           tv.unique_types
         FROM template_versions tv
        WHERE tv.workspace_id = $1
        ORDER BY tv.saved_at DESC, tv.version_number DESC
        LIMIT 1`,
        [workspaceId]
      ),
      this.pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE session_elapsed_ms IS NOT NULL) AS tracked_count,
           COALESCE(MAX(session_elapsed_ms), 0) AS longest_ms,
           COALESCE(MIN(session_elapsed_ms), 0) AS shortest_ms,
           COALESCE(AVG(session_elapsed_ms), 0) AS average_ms
         FROM template_versions
        WHERE workspace_id = $1`,
        [workspaceId]
      ),
      this.pool.query(
        `SELECT COUNT(*) AS active_templates
           FROM templates
          WHERE workspace_id = $1
            AND status = 'active'`,
        [workspaceId]
      )
    ]);

    const topComponents = await this.getTopComponents(workspaceId);
    const leastUsedTypes = await this.getLeastUsedTypes(workspaceId, 3);
    const latestRow = latestVersion.rows[0] || null;
    const latestSummary = latestRow
      ? {
        versionId: latestRow.version_id,
        templateId: latestRow.template_id,
        savedAt: latestRow.saved_at,
        name: latestRow.display_name,
        totalComponents: Math.max(0, Math.floor(toFiniteNumber(latestRow.total_components))),
        uniqueTypes: Math.max(0, Math.floor(toFiniteNumber(latestRow.unique_types)))
      }
      : null;
    const latestScores = jsonOrDefault(latestRow?.scores, {});
    const session = sessionStats.rows[0] || {};

    return {
      builderId: workspace.workspaceId,
      templatesSaved: workspace.templatesSaved,
      activeTemplates: Math.max(0, Math.floor(toFiniteNumber(activeTemplates.rows[0]?.active_templates))),
      componentsTotal: workspace.componentsTotal,
      xpTotal: workspace.xpTotal,
      level: workspace.level,
      nextLevelXp: 0,
      streak: workspace.streak,
      achievementsUnlocked: workspace.achievementsUnlocked,
      handcraftedChain: workspace.handcraftedChain,
      neglectedRevivalCount: workspace.neglectedRevivalCount,
      topComponents,
      sessionTimeStats: {
        trackedCount: Math.max(0, Math.floor(toFiniteNumber(session.tracked_count))),
        longestMs: Math.max(0, Math.floor(toFiniteNumber(session.longest_ms))),
        shortestMs: Math.max(0, Math.floor(toFiniteNumber(session.shortest_ms))),
        averageMs: Math.max(0, Math.round(toFiniteNumber(session.average_ms)))
      },
      leastUsedTypes,
      latestTemplate: latestSummary,
      latestScores,
      silentCoach: ''
    };
  }

  async getTopComponents(workspaceId = this.workspaceId, limit) {
    const hasLimit = Number.isFinite(limit) && limit > 0;
    const result = hasLimit
      ? await this.pool.query(
        `SELECT component_type, component_count
           FROM workspace_component_totals
          WHERE workspace_id = $1
            AND component_count > 0
          ORDER BY component_count DESC, component_type ASC
          LIMIT $2`,
        [workspaceId, limit]
      )
      : await this.pool.query(
        `SELECT component_type, component_count
           FROM workspace_component_totals
          WHERE workspace_id = $1
            AND component_count > 0
          ORDER BY component_count DESC, component_type ASC`,
        [workspaceId]
      );

    return result.rows.map((row) => ({
      type: row.component_type,
      count: Math.max(0, Math.floor(toFiniteNumber(row.component_count)))
    }));
  }

  async getLeastUsedTypes(workspaceId = this.workspaceId, limit = 3) {
    const result = await this.pool.query(
      `SELECT component_type, component_count
         FROM workspace_component_totals
        WHERE workspace_id = $1
        ORDER BY component_count ASC, component_type ASC
        LIMIT $2`,
      [workspaceId, limit]
    );

    return result.rows.map((row) => row.component_type);
  }

  async getComponents(workspaceId = this.workspaceId) {
    await this.ensureReady();
    const workspace = await this.getWorkspaceProfile(workspaceId);
    const total = Math.max(1, workspace.componentsTotal);
    const result = await this.pool.query(
      `SELECT component_type, component_count
         FROM workspace_component_totals
        WHERE workspace_id = $1
        ORDER BY component_count DESC, component_type ASC`,
      [workspaceId]
    );

    return {
      totalComponents: workspace.componentsTotal,
      byType: result.rows.map((row) => {
        const count = Math.max(0, Math.floor(toFiniteNumber(row.component_count)));
        return {
          type: row.component_type,
          count,
          share: Number(((count / total) * 100).toFixed(2))
        };
      }),
      leastUsedTypes: await this.getLeastUsedTypes(workspaceId, 3)
    };
  }

  async getBuilderUsageTotals(workspaceId = this.workspaceId) {
    await this.ensureReady();
    const result = await this.pool.query(
      `SELECT action_counts
         FROM template_versions
        WHERE workspace_id = $1`,
      [workspaceId]
    );

    const totals = {};
    result.rows.forEach((row) => {
      const actionCounts = jsonOrDefault(row.action_counts, {});
      const manualAddsByType = (actionCounts && typeof actionCounts === 'object')
        ? actionCounts.manualAddsByType
        : null;
      if (!manualAddsByType || typeof manualAddsByType !== 'object') return;

      Object.entries(manualAddsByType).forEach(([type, count]) => {
        const safeType = String(type || '').trim();
        const safeCount = Math.max(0, Math.floor(toFiniteNumber(count)));
        if (!safeType || safeCount < 1) return;
        totals[safeType] = (totals[safeType] || 0) + safeCount;
      });
    });

    return totals;
  }

  async getTimeline(days = 30, workspaceId = this.workspaceId) {
    await this.ensureReady();
    const normalizedDays = Math.min(365, Math.max(7, Math.floor(toFiniteNumber(days)) || 30));
    const result = await this.pool.query(
      `SELECT ymd, versions_saved, xp_gained, mastery_sum, mastery_count
         FROM workspace_daily_stats
        WHERE workspace_id = $1
          AND ymd >= CURRENT_DATE - ($2::integer - 1)
        ORDER BY ymd ASC`,
      [workspaceId, normalizedDays]
    );
    const byDate = new Map(result.rows.map((row) => [
      String(row.ymd).slice(0, 10),
      row
    ]));

    const timeline = [];
    const now = new Date();
    for (let offset = normalizedDays - 1; offset >= 0; offset -= 1) {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset));
      const ymd = date.toISOString().slice(0, 10);
      const row = byDate.get(ymd);
      const masteryCount = Math.max(0, Math.floor(toFiniteNumber(row?.mastery_count)));
      timeline.push({
        date: ymd,
        templatesSaved: Math.max(0, Math.floor(toFiniteNumber(row?.versions_saved))),
        xpGained: Math.max(0, Math.floor(toFiniteNumber(row?.xp_gained))),
        masteryAvg: masteryCount > 0
          ? Number((toFiniteNumber(row?.mastery_sum) / masteryCount).toFixed(2))
          : 0
      });
    }

    return {
      days: normalizedDays,
      timeline
    };
  }

  async resetWorkspace(workspaceId = this.workspaceId) {
    await this.ensureReady();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM workspaces WHERE workspace_id = $1`, [workspaceId]);
      await client.query(
        `INSERT INTO workspaces (workspace_id, display_name)
         VALUES ($1, $2)`,
        [workspaceId, this.displayName]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    await this.blobStore.deletePrefix(`templates/${workspaceId}`);
    await this.blobStore.deletePrefix(`template-covers/${workspaceId}`);
    return { ok: true };
  }
}

module.exports = {
  PostgresTemplateLibraryStore,
  encodeCursor,
  decodeCursor
};
