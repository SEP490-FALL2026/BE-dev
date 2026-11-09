import { VersionPageResponseDto, VersionResponseDto, mineVersionSummarySchema } from './budget.dto';

describe('G5-06 R-I08 the wire of a version has neither a kind nor SUPERSEDED (QĐ-97b)', () => {
  it('budgetVersionGet: no kind, nothing it is based on, and a state that is never SUPERSEDED', () => {
    const version = VersionResponseDto.schema.shape.data.unwrap().shape.version;

    expect(Object.keys(version.shape)).not.toContain('kind');
    expect(Object.keys(version.shape)).not.toContain('basedOn');
    expect(version.shape.state.options).not.toContain('SUPERSEDED');
  });

  it('budgetVersionList: no kind, and a state that is never SUPERSEDED', () => {
    const item = VersionPageResponseDto.schema.shape.data.unwrap().shape.items.element;

    expect(Object.keys(item.shape)).not.toContain('kind');
    expect(item.shape.state.options).not.toContain('SUPERSEDED');
  });

  it('budgetMineVersionList: a state that is never SUPERSEDED', () => {
    expect(mineVersionSummarySchema.shape.state.options).not.toContain('SUPERSEDED');
  });
});
