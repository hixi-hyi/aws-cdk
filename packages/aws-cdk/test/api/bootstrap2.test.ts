const mockDeployStack = jest.fn();

jest.mock('../../lib/api/deploy-stack', () => ({
  deployStack: mockDeployStack,
}));

let mockTheToolkitInfo: any;

import { Bootstrapper, DeployStackOptions, ToolkitInfo } from '../../lib/api';
import { MockSdkProvider, mockToolkitInfo } from '../util/mock-sdk';

let bootstrapper: Bootstrapper;
beforeEach(() => {
  (ToolkitInfo as any).lookup = jest.fn().mockImplementation(() => Promise.resolve(mockTheToolkitInfo));
  bootstrapper = new Bootstrapper({ source: 'default' });
});

describe('Bootstrapping v2', () => {
  const env = {
    account: '123456789012',
    region: 'us-east-1',
    name: 'mock',
  };

  let sdk: MockSdkProvider;
  beforeEach(() => {
    sdk = new MockSdkProvider({ realSdk: false });
    mockTheToolkitInfo = undefined;
  });

  test('passes the bucket name as a CFN parameter', async () => {
    await bootstrapper.bootstrapEnvironment(env, sdk, {
      parameters: {
        bucketName: 'my-bucket-name',
      },
    });

    expect(mockDeployStack).toHaveBeenCalledWith(expect.objectContaining({
      parameters: expect.objectContaining({
        FileAssetsBucketName: 'my-bucket-name',
        PublicAccessBlockConfiguration: 'true',
      }),
    }));
  });

  test('passes the KMS key ID as a CFN parameter', async () => {
    await bootstrapper.bootstrapEnvironment(env, sdk, {
      parameters: {
        kmsKeyId: 'my-kms-key-id',
      },
    });

    expect(mockDeployStack).toHaveBeenCalledWith(expect.objectContaining({
      parameters: expect.objectContaining({
        FileAssetsBucketKmsKeyId: 'my-kms-key-id',
        PublicAccessBlockConfiguration: 'true',
      }),
    }));
  });

  test('passes false to PublicAccessBlockConfiguration', async () => {
    await bootstrapper.bootstrapEnvironment(env, sdk, {
      parameters: {
        publicAccessBlockConfiguration: false,
      },
    });

    expect(mockDeployStack).toHaveBeenCalledWith(expect.objectContaining({
      parameters: expect.objectContaining({
        PublicAccessBlockConfiguration: 'false',
      }),
    }));
  });

  test('passing trusted accounts without CFN managed policies results in an error', async () => {
    await expect(bootstrapper.bootstrapEnvironment(env, sdk, {
      parameters: {
        trustedAccounts: ['123456789012'],
      },
    }))
      .rejects
      .toThrow(/--cloudformation-execution-policies.*--trust/);
  });

  test('allow adding trusted account if there was already a policy on the stack', async () => {
    // GIVEN
    mockTheToolkitInfo = {
      parameters: {
        CloudFormationExecutionPolicies: 'arn:aws:something',
      },
    };

    await bootstrapper.bootstrapEnvironment(env, sdk, {
      parameters: {
        trustedAccounts: ['123456789012'],
      },
    });
    // Did not throw
  });

  test('Do not allow downgrading bootstrap stack version', async () => {
    // GIVEN
    mockTheToolkitInfo = {
      version: 999,
    };

    await expect(bootstrapper.bootstrapEnvironment(env, sdk, {}))
      .rejects.toThrow('Not downgrading existing bootstrap stack');
  });

  test('bootstrap template has the right exports', async () => {
    let template: any;
    mockDeployStack.mockImplementation((args: DeployStackOptions) => {
      template = args.stack.template;
    });

    await bootstrapper.bootstrapEnvironment(env, sdk, {});

    const exports = Object.values(template.Outputs ?? {})
      .filter((o: any) => o.Export !== undefined)
      .map((o: any) => o.Export.Name);

    expect(exports).toEqual([
      // This used to be used by aws-s3-assets
      { 'Fn::Sub': 'CdkBootstrap-${Qualifier}-FileAssetKeyArn' },
    ]);
  });

  test('stack is not termination protected by default', async () => {
    await bootstrapper.bootstrapEnvironment(env, sdk);

    expect(mockDeployStack).toHaveBeenCalledWith(expect.objectContaining({
      stack: expect.objectContaining({
        terminationProtection: false,
      }),
    }));
  });

  test('stack is termination protected when option is set', async () => {
    await bootstrapper.bootstrapEnvironment(env, sdk, {
      terminationProtection: true,
    });

    expect(mockDeployStack).toHaveBeenCalledWith(expect.objectContaining({
      stack: expect.objectContaining({
        terminationProtection: true,
      }),
    }));
  });

  test('termination protection is left alone when option is not given', async () => {
    mockTheToolkitInfo = mockToolkitInfo({
      EnableTerminationProtection: true,
    });

    await bootstrapper.bootstrapEnvironment(env, sdk, {});

    expect(mockDeployStack).toHaveBeenCalledWith(expect.objectContaining({
      stack: expect.objectContaining({
        terminationProtection: true,
      }),
    }));
  });

  test('termination protection can be switched off', async () => {
    mockTheToolkitInfo = mockToolkitInfo({
      EnableTerminationProtection: true,
    });

    await bootstrapper.bootstrapEnvironment(env, sdk, {
      terminationProtection: false,
    });

    expect(mockDeployStack).toHaveBeenCalledWith(expect.objectContaining({
      stack: expect.objectContaining({
        terminationProtection: false,
      }),
    }));
  });

  afterEach(() => {
    mockDeployStack.mockClear();
  });
});