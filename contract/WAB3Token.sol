// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title WAB3 Token (TRC-20)
 * @notice WAB3 遵循 TRC-20 标准的代币合约，固定总发行量，6 位小数。
 * 全部代币在部署时铸造给合约部署者（owner）。
 */
contract WAB3Token {
    string public constant name = "USTD";
    string public constant symbol = "WAB3";
    uint8 public constant decimals = 6;

    uint256 public immutable totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @notice 固定总发行量：21,000,000 枚 WAB3（6 位小数）
     */
    constructor(uint256 _initialSupply) {
        require(_initialSupply > 0, "initial supply must be > 0");
        totalSupply = _initialSupply * 10 ** decimals;
        balanceOf[msg.sender] = totalSupply;
        emit Transfer(address(0), msg.sender, totalSupply);
    }

    /**
     * @notice 将 value 数量的代币从调用者转给 to
     */
    function transfer(address to, uint256 value) external returns (bool) {
        require(to != address(0), "transfer to zero address");
        _transfer(msg.sender, to, value);
        return true;
    }

    /**
     * @notice 授权 spender 从调用者账户转出 value 数量的代币
     */
    function approve(address spender, uint256 value) external returns (bool) {
        require(spender != address(0), "approve to zero address");
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    /**
     * @notice 从 from 转出 value 数量的代币给 to，前提是调用者已被授权
     */
    function transferFrom(
        address from,
        address to,
        uint256 value
    ) external returns (bool) {
        require(to != address(0), "transfer to zero address");
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= value, "insufficient allowance");
            allowance[from][msg.sender] = allowed - value;
        }
        _transfer(from, to, value);
        return true;
    }

    function _transfer(
        address from,
        address to,
        uint256 value
    ) internal {
        require(from != address(0), "transfer from zero address");
        require(balanceOf[from] >= value, "insufficient balance");
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
