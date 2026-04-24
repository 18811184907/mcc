# 测试反模式（Testing Anti-Patterns）

**何时加载这份参考：** 写/改测试、加 mock、或想在生产代码里加"只给测试用"的方法时。

## 概述

测试必须验证**真实行为**，而不是 mock 的行为。mock 是**隔离**的手段，不是被测对象。

**核心原则：** 测代码**做了什么**，不测 mock**做了什么**。

**严格遵循 TDD 可以避免这些反模式。**

## 铁律

```
1. 永远不测 mock 的行为
2. 永远不在生产类上加"只给测试用"的方法
3. 不理解依赖就不 mock
```

## 反模式 1：测 mock 的行为

**违规：**
```typescript
// ❌ BAD: Testing that the mock exists
test('renders sidebar', () => {
  render(<Page />);
  expect(screen.getByTestId('sidebar-mock')).toBeInTheDocument();
});
```

**为什么错：**
- 你在验证 mock 存在，而不是组件工作
- 测试在 mock 存在时通过、不在时失败
- 对真实行为一无所知

**触发语（人类常问的话）：** "Are we testing the behavior of a mock?"

**修正：**
```typescript
// ✅ GOOD: Test real component or don't mock it
test('renders sidebar', () => {
  render(<Page />);  // Don't mock sidebar
  expect(screen.getByRole('navigation')).toBeInTheDocument();
});

// OR if sidebar must be mocked for isolation:
// Don't assert on the mock - test Page's behavior with sidebar present
```

### Gate Function

```
BEFORE asserting on any mock element:
  Ask: "Am I testing real component behavior or just mock existence?"

  IF testing mock existence:
    STOP - Delete the assertion or unmock the component

  Test real behavior instead
```

## 反模式 2：生产类里的"测试专用方法"

**违规：**
```typescript
// ❌ BAD: destroy() only used in tests
class Session {
  async destroy() {  // Looks like production API!
    await this._workspaceManager?.destroyWorkspace(this.id);
    // ... cleanup
  }
}

// In tests
afterEach(() => session.destroy());
```

**为什么错：**
- 生产类被测试专用代码污染
- 真的在生产环境被调用会很危险
- 违反 YAGNI 和关注点分离
- 把"对象生命周期"和"实体生命周期"混在一起

**修正：**
```typescript
// ✅ GOOD: Test utilities handle test cleanup
// Session has no destroy() - it's stateless in production

// In test-utils/
export async function cleanupSession(session: Session) {
  const workspace = session.getWorkspaceInfo();
  if (workspace) {
    await workspaceManager.destroyWorkspace(workspace.id);
  }
}

// In tests
afterEach(() => cleanupSession(session));
```

### Gate Function

```
BEFORE adding any method to production class:
  Ask: "Is this only used by tests?"

  IF yes:
    STOP - Don't add it
    Put it in test utilities instead

  Ask: "Does this class own this resource's lifecycle?"

  IF no:
    STOP - Wrong class for this method
```

## 反模式 3：不理解就 mock

**违规：**
```typescript
// ❌ BAD: Mock breaks test logic
test('detects duplicate server', () => {
  // Mock prevents config write that test depends on!
  vi.mock('ToolCatalog', () => ({
    discoverAndCacheTools: vi.fn().mockResolvedValue(undefined)
  }));

  await addServer(config);
  await addServer(config);  // Should throw - but won't!
});
```

**为什么错：**
- 被 mock 掉的方法有测试依赖的副作用（写 config）
- 为了"安全"过度 mock，反而破坏真实行为
- 测试因错误原因通过，或莫名失败

**修正：**
```typescript
// ✅ GOOD: Mock at correct level
test('detects duplicate server', () => {
  // Mock the slow part, preserve behavior test needs
  vi.mock('MCPServerManager'); // Just mock slow server startup

  await addServer(config);  // Config written
  await addServer(config);  // Duplicate detected ✓
});
```

### Gate Function

```
BEFORE mocking any method:
  STOP - Don't mock yet

  1. Ask: "What side effects does the real method have?"
  2. Ask: "Does this test depend on any of those side effects?"
  3. Ask: "Do I fully understand what this test needs?"

  IF depends on side effects:
    Mock at lower level (the actual slow/external operation)
    OR use test doubles that preserve necessary behavior
    NOT the high-level method the test depends on

  IF unsure what test depends on:
    Run test with real implementation FIRST
    Observe what actually needs to happen
    THEN add minimal mocking at the right level

  Red flags:
    - "I'll mock this to be safe"
    - "This might be slow, better mock it"
    - Mocking without understanding the dependency chain
```

## 反模式 4：残缺的 mock

**违规：**
```typescript
// ❌ BAD: Partial mock - only fields you think you need
const mockResponse = {
  status: 'success',
  data: { userId: '123', name: 'Alice' }
  // Missing: metadata that downstream code uses
};

// Later: breaks when code accesses response.metadata.requestId
```

**为什么错：**
- **残缺的 mock 隐藏结构假设** —— 你只 mock 了你知道的字段
- **下游代码可能依赖你没包括的字段** —— 静默失败
- **测试通过但集成失败** —— mock 不完整，真实 API 完整
- **虚假的信心** —— 测试其实什么也没证明

**铁律：** Mock **完整的数据结构**（真实 API 的全貌），而不是只 mock 当前测试要用的那几个字段。

**修正：**
```typescript
// ✅ GOOD: Mirror real API completeness
const mockResponse = {
  status: 'success',
  data: { userId: '123', name: 'Alice' },
  metadata: { requestId: 'req-789', timestamp: 1234567890 }
  // All fields real API returns
};
```

### Gate Function

```
BEFORE creating mock responses:
  Check: "What fields does the real API response contain?"

  Actions:
    1. Examine actual API response from docs/examples
    2. Include ALL fields system might consume downstream
    3. Verify mock matches real response schema completely

  Critical:
    If you're creating a mock, you must understand the ENTIRE structure
    Partial mocks fail silently when code depends on omitted fields

  If uncertain: Include all documented fields
```

## 反模式 5：测试当事后追加

**违规：**
```
✅ Implementation complete
❌ No tests written
"Ready for testing"
```

**为什么错：**
- 测试是实现的一部分，不是可选的事后补丁
- TDD 本来就会防止这种情况
- 没有测试就不能说"完成"

**修正：**
```
TDD cycle:
1. Write failing test
2. Implement to pass
3. Refactor
4. THEN claim complete
```

## Mock 变得太复杂时

**警告信号：**
- Mock 的 setup 比测试逻辑还长
- 为了让测试过而 mock 一切
- Mock 缺少真实组件有的方法
- Mock 一改测试就挂

**触发语（人类常问的话）：** "Do we need to be using a mock here?"

**考虑：** 用真实组件做集成测试，往往比一堆复杂的 mock 更简单。

## TDD 如何防止这些反模式

**为什么 TDD 管用：**
1. **先写测试** → 强迫你想清楚到底在测什么
2. **看它失败** → 确认测试是在测真实行为，不是测 mock
3. **最小实现** → 没有"测试专用方法"混入
4. **真实依赖** → 在 mock 之前先看测试真正需要什么

**如果你在测 mock 行为，说明你违反了 TDD** —— 在看着测试对真实代码失败之前就先加了 mock。

## 速查

| 反模式 | 修正 |
|---|---|
| 对 mock 元素做断言 | 测真实组件或取消 mock |
| 生产类里的测试专用方法 | 移到测试工具包里 |
| 不理解就 mock | 先理解依赖，再最小化 mock |
| 残缺的 mock | 镜像真实 API 的完整结构 |
| 测试当事后追加 | TDD —— 先测试 |
| 过度复杂的 mock | 考虑改集成测试 |

## 红旗

- 断言里出现 `*-mock` testId
- 方法只在测试文件里被调用
- Mock 的 setup 占测试的 50% 以上
- 移掉 mock 测试就挂
- 讲不清为什么需要这个 mock
- "为了安全先 mock 一下"

## 底线

**Mock 是用来隔离的工具，不是用来测的东西。**

如果 TDD 告诉你"你在测 mock 的行为"，那就是方向错了。

修法：测真实行为；或者反问自己到底为什么要 mock。
